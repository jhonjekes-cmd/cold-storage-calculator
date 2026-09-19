/**
 * 冷库冷量计算核心模块
 * 依据《冷库设计标准》GB 50072 相关公式
 * 青岛冷锋节能工程有限公司
 */

// 保温材料导热系数表 [W/(m·K)]
const MATERIAL_LAMBDA = {
  pu: 0.023,
  pir: 0.022,
  eps: 0.040,
  xps: 0.030,
  rockwool: 0.040,
  stainless_steel: 0.023
};

// 材料中文名称映射
const MATERIAL_NAMES = {
  pu: '聚氨酯板(PU)',
  pir: '聚氨酯板(PIR)',
  eps: '聚苯板(EPS)',
  xps: '挤塑板(XPS)',
  rockwool: '岩棉板',
  stainless_steel: '不锈钢聚氨酯板',
  custom: '自定义'
};

/**
 * 根据保温材料和厚度计算传热系数K
 * K = 1 / (δ/λ + Rsi + Rso)
 */
function calculateKValue(material, thickness, customLambda = 0.023) {
  const lambda = material === 'custom' ? customLambda : (MATERIAL_LAMBDA[material] || 0.023);
  const delta = thickness / 1000;
  const Rsi = 0.11;
  const Rso = 0.04;
  const totalResistance = delta / lambda + Rsi + Rso;
  return 1 / totalResistance;
}

/**
 * 计算湿空气焓值
 * h = 1.005*t + d*(2501 + 1.86*t)
 */
function calculateEnthalpy(temp, rh) {
  const es = 611.2 * Math.exp((17.67 * temp) / (temp + 243.5));
  const e = es * (rh / 100);
  const d = 0.622 * e / (101325 - e);
  const h = 1.005 * temp + d * (2501 + 1.86 * temp);
  return h;
}

/**
 * 围护结构传热负荷计算
 * Q1 = K * F * Δt * α
 */
function calculateEnvelope(params) {
  const {
    roomLength, roomWidth, roomHeight,
    indoorTemp, outdoorTemp,
    roofK, wallK, floorK, partitionK,
    roofAlpha, wallAlpha, floorAlpha,
    partitionArea, adjacentTemp
  } = params;

  const roofArea = roomLength * roomWidth;
  const floorArea = roomLength * roomWidth;
  const partArea = partitionArea || 0;
  // 外墙面积 = 四面墙总面积 - 隔墙面积（隔墙部分不再按外墙计算，避免重复）
  const wallArea = Math.max(0, 2 * (roomLength + roomWidth) * roomHeight - partArea);

  const outdoorDelta = outdoorTemp - indoorTemp;
  const adjacentDelta = Math.max(0, (adjacentTemp || 0) - indoorTemp);

  const roofLoad = roofK * roofArea * outdoorDelta * (roofAlpha || 1.3);
  const wallLoad = wallK * wallArea * outdoorDelta * (wallAlpha || 1.0);
  const floorLoad = floorK * floorArea * outdoorDelta * (floorAlpha || 0.5);
  const partitionLoad = partitionK * partArea * adjacentDelta * 1.0;

  const total = roofLoad + wallLoad + floorLoad + partitionLoad;

  return {
    roof: { area: roofArea, k: roofK, delta: outdoorDelta, alpha: roofAlpha || 1.3, load: roofLoad },
    wall: { area: wallArea, k: wallK, delta: outdoorDelta, alpha: wallAlpha || 1.0, load: wallLoad },
    floor: { area: floorArea, k: floorK, delta: outdoorDelta * (floorAlpha || 0.5), alpha: floorAlpha || 0.5, load: floorLoad },
    partition: { area: partArea, k: partitionK, delta: adjacentDelta, alpha: 1.0, load: partitionLoad },
    total: total
  };
}

/**
 * 货物冷负荷计算
 * 包含：货物冷却显热、冻结潜热、冻结后降温、包装材料、运载工具、呼吸热（果蔬）
 */
function calculateGoods(params) {
  const {
    goodsMass, goodsInTemp, goodsOutTemp, freezePoint,
    cpAbove, cpBelow, latentHeat, coolingTime,
    packMass, packCp, packTemp,
    containerMass, containerCp, containerTimes,
    respirationHeat
  } = params;

  const timeSeconds = coolingTime * 3600;

  let sensibleHeat = 0;
  if (goodsInTemp > freezePoint) {
    sensibleHeat = goodsMass * cpAbove * Math.max(0, goodsInTemp - freezePoint) * 1000 / timeSeconds;
  }

  let latentLoad = 0;
  if (goodsOutTemp <= freezePoint && goodsInTemp > goodsOutTemp) {
    latentLoad = goodsMass * latentHeat * 1000 / timeSeconds;
  }

  let subcoolHeat = 0;
  if (goodsOutTemp < freezePoint) {
    subcoolHeat = goodsMass * cpBelow * (freezePoint - goodsOutTemp) * 1000 / timeSeconds;
  }

  const goodsTotal = sensibleHeat + latentLoad + subcoolHeat;
  const packLoad = packMass * packCp * Math.max(0, packTemp - goodsOutTemp) * 1000 / timeSeconds;
  const containerDailyMass = containerMass * containerTimes;
  const containerLoad = containerDailyMass * containerCp * Math.max(0, packTemp - goodsOutTemp) * 1000 / timeSeconds;

  // 呼吸热（果蔬类持续放热，单位W/kg，连续负荷不除以冷却时间）
  const respHeat = (respirationHeat || 0) * goodsMass;

  const total = goodsTotal + packLoad + containerLoad + respHeat;

  return {
    sensible: sensibleHeat + subcoolHeat,
    latent: latentLoad,
    goodsTotal: goodsTotal,
    pack: packLoad,
    container: containerLoad,
    respiration: respHeat,
    total: total
  };
}

/**
 * 开门渗透冷负荷计算（基于门洞尺寸+开门频次+修正系数）
 * Q = F_d × v × ρ × Δh × (n × τ / 86400) × 修正系数
 */
function calculateVentilation(params) {
  const {
    indoorTemp, indoorHumidity,
    outdoorTemp, outdoorHumidity,
    doorWidth, doorHeight, doorOpens, doorDuration,
    hasAirCurtain, hasBufferRoom
  } = params;

  // 门洞面积
  const Fd = (doorWidth || 0) * (doorHeight || 0);

  // 基础渗透风速 (m/s) —— 经验值：普通门约1.0 m/s
  const v = 1.0;

  // 风幕修正：实际工程中风幕仅减少约10%冷热交换
  let curtainFactor = 1.0;
  if (hasAirCurtain) curtainFactor = 0.9;

  // 缓冲间修正（含防撞门/快速卷帘门）：有效阻隔约80%冷热交换
  let bufferFactor = 1.0;
  if (hasBufferRoom) bufferFactor = 0.2;

  // 总修正系数
  const totalFactor = curtainFactor * bufferFactor;

  // 焓差
  const hOut = calculateEnthalpy(outdoorTemp, outdoorHumidity);
  const hIn = calculateEnthalpy(indoorTemp, indoorHumidity);
  const deltaH = Math.max(0, hOut - hIn);

  // 空气密度 (kg/m³)
  const rho = 1.2;

  // 每日渗透空气量 (m³/day) = 门洞面积 × 风速 × 每日开门秒数 × 修正系数
  const dailyAirVolume = Fd * v * (doorOpens * doorDuration) * totalFactor;

  // 每日热负荷 (kJ/day) = 空气量 × 密度 × 焓差
  const dailyHeat = dailyAirVolume * rho * deltaH;

  // 平均热负荷 (W)
  const avgLoad = dailyHeat * 1000 / 86400;

  // 峰值热负荷（开门瞬间）(W)
  const peakLoad = Fd * v * rho * deltaH * 1000 * totalFactor;

  return {
    doorArea: Fd,
    dailyAirVolume: dailyAirVolume,
    hOut: hOut,
    hIn: hIn,
    deltaH: deltaH,
    avgLoad: avgLoad,
    peakLoad: peakLoad,
    total: avgLoad
  };
}

/**
 * 操作管理冷负荷（人员+照明+设备）
 */
function calculateOperation(params) {
  const {
    roomLength, roomWidth,
    personCount, personHeat, personTime,
    lightingDensity, lightingTime,
    equipmentPower, equipmentDiversity, equipmentTime
  } = params;

  const floorArea = roomLength * roomWidth;

  const personTotal = personCount * personHeat * (personTime / 24);
  const lightingTotal = lightingDensity * floorArea * (lightingTime / 24);
  const equipmentTotal = equipmentPower * 1000 * equipmentDiversity * (equipmentTime / 24);

  const total = personTotal + lightingTotal + equipmentTotal;

  return {
    person: personTotal,
    lighting: lightingTotal,
    equipment: equipmentTotal,
    door: 0,
    total: total
  };
}

/**
 * 电机运行热负荷
 */
function calculateMotor(params) {
  const { fanMotorPower, motorEfficiency, motorTime, otherMotorPower } = params;

  const fanLoad = fanMotorPower * 1000 * motorEfficiency * (motorTime / 24);
  const otherLoad = otherMotorPower * 1000 * motorEfficiency * (motorTime / 24);
  const total = fanLoad + otherLoad;

  return { fan: fanLoad, other: otherLoad, total: total };
}

/**
 * 总冷量计算
 */
function calculateTotal(params) {
  const envelope = calculateEnvelope(params);
  const goods = calculateGoods(params);
  const ventilation = calculateVentilation(params);
  const operation = calculateOperation(params);
  const motor = calculateMotor(params);

  const totalW = envelope.total + goods.total + ventilation.total + operation.total + motor.total;
  const totalKW = totalW / 1000;
  const safetyFactor = params.safetyFactor / 100;
  const designKW = totalKW * (1 + safetyFactor);

  return {
    envelope, goods, ventilation, operation, motor,
    totalW, totalKW, designKW, safetyFactor
  };
}

/**
 * 设备选型计算
 */
function calculateSelection(result, params) {
  const { evapTemp, condTemp, copValue } = params;
  const designKW = result.designKW;
  const compressorPower = designKW / copValue;
  const fanCapacity = designKW * 1.2;

  return {
    evapTemp, condTemp, cop: copValue,
    compressorPower,
    suggestedCapacity: designKW,
    fanCapacity
  };
}

module.exports = {
  MATERIAL_LAMBDA,
  MATERIAL_NAMES,
  calculateKValue,
  calculateEnthalpy,
  calculateEnvelope,
  calculateGoods,
  calculateVentilation,
  calculateOperation,
  calculateMotor,
  calculateTotal,
  calculateSelection
};
