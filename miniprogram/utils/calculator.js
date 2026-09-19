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
 * 包含：货物冷却显热、冻结潜热、冻结后降温、包装材料（含托盘、纸箱、周转筐）、呼吸热（果蔬）
 */
function calculateGoods(params) {
  const {
    goodsMass, goodsInTemp, goodsOutTemp, freezePoint,
    cpAbove, cpBelow, latentHeat, coolingTime,
    packMass, packCp, packTemp,
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
  // 包装材料（含托盘、纸箱、周转筐等运载包装）
  const packLoad = packMass * packCp * Math.max(0, packTemp - goodsOutTemp) * 1000 / timeSeconds;

  // 呼吸热（果蔬类持续放热，单位W/kg，连续负荷不除以冷却时间）
  const respHeat = (respirationHeat || 0) * goodsMass;

  const total = goodsTotal + packLoad + respHeat;

  return {
    sensible: sensibleHeat + subcoolHeat,
    latent: latentLoad,
    goodsTotal: goodsTotal,
    pack: packLoad,
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
 * 制冷剂物性数据表 [饱和吸气状态]
 * h1: 吸气焓值(kJ/kg), v1: 吸气比容(m³/kg)
 */
const REFRIGERANT_PROPS = {
  R22: {
    suction: [
      { t: 5, h: 406, v: 0.056 },
      { t: 0, h: 405, v: 0.069 },
      { t: -5, h: 403, v: 0.080 },
      { t: -10, h: 401, v: 0.094 },
      { t: -15, h: 399, v: 0.112 },
      { t: -20, h: 396, v: 0.135 },
      { t: -25, h: 394, v: 0.165 },
      { t: -30, h: 391, v: 0.205 },
      { t: -35, h: 387, v: 0.260 },
      { t: -40, h: 383, v: 0.340 }
    ],
    liquid: [
      { t: 35, h: 241 }, { t: 40, h: 249 }, { t: 45, h: 257 },
      { t: 50, h: 265 }, { t: 55, h: 273 }
    ]
  },
  R507: {
    suction: [
      { t: 5, h: 382, v: 0.034 },
      { t: 0, h: 380, v: 0.041 },
      { t: -5, h: 378, v: 0.049 },
      { t: -10, h: 376, v: 0.060 },
      { t: -15, h: 373, v: 0.073 },
      { t: -20, h: 370, v: 0.091 },
      { t: -25, h: 366, v: 0.114 },
      { t: -30, h: 362, v: 0.146 },
      { t: -35, h: 357, v: 0.193 },
      { t: -40, h: 351, v: 0.265 }
    ],
    liquid: [
      { t: 35, h: 248 }, { t: 40, h: 256 }, { t: 45, h: 264 },
      { t: 50, h: 272 }, { t: 55, h: 280 }
    ]
  }
};

// 线性插值
function interpolate(table, temp, key) {
  if (temp <= table[0].t) return table[0][key];
  if (temp >= table[table.length - 1].t) return table[table.length - 1][key];
  for (let i = 0; i < table.length - 1; i++) {
    if (temp >= table[i + 1].t && temp <= table[i].t) {
      const ratio = (temp - table[i + 1].t) / (table[i].t - table[i + 1].t);
      return table[i + 1][key] + ratio * (table[i][key] - table[i + 1][key]);
    }
  }
  return table[0][key];
}

/**
 * 设备选型计算（含制冷剂、COP、排气量）
 * 理论COP基于卡诺循环 × 压缩机效率因子
 * 实际COP = 理论COP × 效率因子 × 经济器提升系数 × 工程修正(0.9)
 *
 * 效率依据：
 * - 实际循环COP约为卡诺COP的40~60%（参考MechSimulator/西安交大实验数据）
 * - 活塞式半封闭压缩机效率因子约0.48~0.52
 * - 螺杆式压缩机效率因子约0.53~0.57
 * - 经济器提升（参考Copeland/Bitzer实测数据）：
 *   蒸发温度>-5℃：约+5%；-15~-5℃：约+10%；-25~-15℃：约+15%；<-25℃：约+20%
 */
function calculateSelection(result, params) {
  const { evapTemp, condTemp, refrigerant, compressorType, hasEconomizer } = params;
  const designKW = result.designKW;
  const ref = REFRIGERANT_PROPS[refrigerant] || REFRIGERANT_PROPS.R507;

  // 吸气状态参数
  const h1 = interpolate(ref.suction, evapTemp, 'h');
  const v1 = interpolate(ref.suction, evapTemp, 'v');
  // 冷凝液焓
  const h3 = interpolate(ref.liquid, condTemp, 'h');

  // 单位质量制冷量
  const q0 = h1 - h3; // kJ/kg
  // 单位容积制冷量
  const qv = q0 / v1; // kJ/m³

  // 理论COP（卡诺循环）
  const tKelvinE = evapTemp + 273.15;
  const tKelvinC = condTemp + 273.15;
  const carnotCOP = tKelvinE / Math.max(1, tKelvinC - tKelvinE);

  // 压缩机效率因子（活塞式偏低，螺杆式偏高）
  // R22/R507物性差异已通过焓值体现，效率因子主要区分压缩机结构
  let efficiencyFactor;
  if (compressorType === 'screw') {
    efficiencyFactor = 0.55;  // 螺杆式
  } else {
    efficiencyFactor = 0.49;  // 活塞式（默认）
  }
  const theoreticalCOP = carnotCOP * efficiencyFactor;

  // 经济器提升系数（根据蒸发温度，越低提升越大）
  let econBoost = 1.0;
  let econDesc = '无经济器';
  if (hasEconomizer) {
    if (evapTemp >= -5) {
      econBoost = 1.05; econDesc = '经济器(+5%)';
    } else if (evapTemp >= -15) {
      econBoost = 1.10; econDesc = '经济器(+10%)';
    } else if (evapTemp >= -25) {
      econBoost = 1.15; econDesc = '经济器(+15%)';
    } else {
      econBoost = 1.20; econDesc = '经济器(+20%)';
    }
  }

  // 工程修正：× 0.9（电机效率、管路压降、过热损失等）
  const correctedCOP = theoreticalCOP * econBoost * 0.9;

  // 压缩机轴功率
  const compressorPower = designKW / Math.max(0.5, correctedCOP);

  // 容积效率（活塞式经验公式；螺杆式容积效率较高）
  let volumetricEff;
  if (compressorType === 'screw') {
    volumetricEff = Math.max(0.6, 0.98 - 0.003 * (condTemp - evapTemp));
  } else {
    volumetricEff = Math.max(0.5, 0.95 - 0.004 * (condTemp - evapTemp));
  }

  // 压缩机理论排气量 (m³/h)
  const displacement = designKW * 3600 / (qv * volumetricEff);

  const fanCapacity = designKW * 1.2;
  const compTypeName = compressorType === 'screw' ? '螺杆式' : '活塞式';

  return {
    evapTemp, condTemp,
    refrigerant: refrigerant || 'R507',
    compressorType: compTypeName,
    econDesc: econDesc,
    carnotCOP: parseFloat(carnotCOP.toFixed(2)),
    efficiencyFactor: efficiencyFactor,
    theoreticalCOP: parseFloat(theoreticalCOP.toFixed(2)),
    correctedCOP: parseFloat(correctedCOP.toFixed(2)),
    compressorPower: parseFloat(compressorPower.toFixed(2)),
    displacement: parseFloat(displacement.toFixed(1)),
    q0: parseFloat(q0.toFixed(1)),
    qv: parseFloat(qv.toFixed(0)),
    v1: parseFloat(v1.toFixed(4)),
    volumetricEff: parseFloat(volumetricEff.toFixed(2)),
    suggestedCapacity: designKW,
    fanCapacity: parseFloat(fanCapacity.toFixed(2))
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
