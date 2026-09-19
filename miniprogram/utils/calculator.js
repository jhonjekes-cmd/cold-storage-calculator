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
  const packLoad = packMass * packCp * Math.max(0, packTemp - goodsOutTemp) * 1000 / timeSeconds;
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
 * 开门渗透冷负荷计算
 */
function calculateVentilation(params) {
  const {
    indoorTemp, indoorHumidity,
    outdoorTemp, outdoorHumidity,
    doorWidth, doorHeight, doorOpens, doorDuration,
    hasAirCurtain, hasBufferRoom
  } = params;

  const Fd = (doorWidth || 0) * (doorHeight || 0);
  const v = 1.0;
  let curtainFactor = 1.0;
  if (hasAirCurtain) curtainFactor = 0.9;
  let bufferFactor = 1.0;
  if (hasBufferRoom) bufferFactor = 0.2;
  const totalFactor = curtainFactor * bufferFactor;

  const hOut = calculateEnthalpy(outdoorTemp, outdoorHumidity);
  const hIn = calculateEnthalpy(indoorTemp, indoorHumidity);
  const deltaH = Math.max(0, hOut - hIn);
  const rho = 1.2;
  const dailyAirVolume = Fd * v * (doorOpens * doorDuration) * totalFactor;
  const dailyHeat = dailyAirVolume * rho * deltaH;
  const avgLoad = dailyHeat * 1000 / 86400;
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
 * 操作管理冷负荷
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

  return { person: personTotal, lighting: lightingTotal, equipment: equipmentTotal, door: 0, total: total };
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

  return { envelope, goods, ventilation, operation, motor, totalW, totalKW, designKW, safetyFactor };
}

/**
 * 制冷剂物性数据表
 */
const REFRIGERANT_PROPS = {
  R22: {
    cpVapor: 0.65,
    isentropicK: 1.16,
    suction: [
      { t: 5, h: 406, v: 0.056, p: 5.84 },
      { t: 0, h: 405, v: 0.069, p: 4.98 },
      { t: -5, h: 403, v: 0.080, p: 4.23 },
      { t: -10, h: 401, v: 0.094, p: 3.55 },
      { t: -15, h: 399, v: 0.112, p: 2.96 },
      { t: -20, h: 396, v: 0.135, p: 2.45 },
      { t: -25, h: 394, v: 0.165, p: 2.00 },
      { t: -30, h: 391, v: 0.205, p: 1.64 },
      { t: -35, h: 387, v: 0.260, p: 1.33 },
      { t: -40, h: 383, v: 0.340, p: 1.05 }
    ],
    liquid: [
      { t: 35, h: 241, p: 13.5 },
      { t: 40, h: 249, p: 15.3 },
      { t: 45, h: 257, p: 17.3 },
      { t: 50, h: 265, p: 19.4 },
      { t: 55, h: 273, p: 21.8 }
    ]
  },
  R507: {
    cpVapor: 0.70,
    isentropicK: 1.12,
    suction: [
      { t: 5, h: 382, v: 0.034, p: 7.72 },
      { t: 0, h: 380, v: 0.041, p: 6.58 },
      { t: -5, h: 378, v: 0.049, p: 5.55 },
      { t: -10, h: 376, v: 0.060, p: 4.64 },
      { t: -15, h: 373, v: 0.073, p: 3.84 },
      { t: -20, h: 370, v: 0.091, p: 3.13 },
      { t: -25, h: 366, v: 0.114, p: 2.52 },
      { t: -30, h: 362, v: 0.146, p: 2.00 },
      { t: -35, h: 357, v: 0.193, p: 1.57 },
      { t: -40, h: 351, v: 0.265, p: 1.20 }
    ],
    liquid: [
      { t: 35, h: 248, p: 17.3 },
      { t: 40, h: 256, p: 19.6 },
      { t: 45, h: 264, p: 22.1 },
      { t: 50, h: 272, p: 24.8 },
      { t: 55, h: 280, p: 27.8 }
    ]
  }
};

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
 * 设备选型计算（实际蒸气压缩循环，吸气过热度8℃）
 */
function calculateSelection(result, params) {
  const { evapTemp, condTemp, refrigerant, compressorType, hasEconomizer, coolingType } = params;
  const designKW = result.designKW;
  const ref = REFRIGERANT_PROPS[refrigerant] || REFRIGERANT_PROPS.R507;

  const superheat = 8;
  const suctionTemp = evapTemp + superheat;
  const T_suction_K = suctionTemp + 273.15;

  const h1_sat = interpolate(ref.suction, evapTemp, 'h');
  const v1_sat = interpolate(ref.suction, evapTemp, 'v');
  const cp_v = ref.cpVapor;
  const h1 = h1_sat + cp_v * superheat;
  const v1 = v1_sat * (T_suction_K / (evapTemp + 273.15));

  const h3 = interpolate(ref.liquid, condTemp, 'h');
  const q0 = h1 - h3;
  const qv = q0 / v1;

  const p1 = interpolate(ref.suction, evapTemp, 'p');
  const p2 = interpolate(ref.liquid, condTemp, 'p');
  const pressureRatio = p2 / Math.max(0.5, p1);
  const k = ref.isentropicK;
  const T2s_K = T_suction_K * Math.pow(pressureRatio, (k - 1) / k);
  const h2s_minus_h1 = cp_v * (T2s_K - T_suction_K);

  let eta_is = compressorType === 'screw' ? 0.75 : 0.72;
  const w_comp = h2s_minus_h1 / eta_is;
  const cycleCOP = q0 / w_comp;

  let econBoost = 1.0;
  let econDesc = '无经济器';
  if (hasEconomizer) {
    if (evapTemp >= -5) { econBoost = 1.05; econDesc = '经济器(+5%)'; }
    else if (evapTemp >= -15) { econBoost = 1.10; econDesc = '经济器(+10%)'; }
    else if (evapTemp >= -25) { econBoost = 1.15; econDesc = '经济器(+15%)'; }
    else { econBoost = 1.20; econDesc = '经济器(+20%)'; }
  }

  const actualCOP = cycleCOP * econBoost * 0.9;
  const compressorPower = designKW / Math.max(0.5, actualCOP);

  let volumetricEff;
  if (compressorType === 'screw') {
    volumetricEff = Math.max(0.6, 0.98 - 0.003 * (condTemp - evapTemp));
  } else {
    volumetricEff = Math.max(0.5, 0.95 - 0.004 * (condTemp - evapTemp));
  }

  const displacement = designKW * 3600 / (qv * volumetricEff);

  const condenserHeat = designKW + compressorPower;
  let condenserType, condenserFactor, condenserCapacity;
  if (coolingType === 'water') {
    condenserType = '水冷冷凝器'; condenserFactor = 1.5;
    condenserCapacity = condenserHeat * 1.5;
  } else if (coolingType === 'evap') {
    condenserType = '蒸发式冷凝器'; condenserFactor = 1.8;
    condenserCapacity = condenserHeat * 1.8;
  } else {
    condenserType = '风冷冷凝器'; condenserFactor = 1.2;
    condenserCapacity = condenserHeat * 1.2;
  }

  const fanCapacity = designKW * 1.2;
  const compTypeName = compressorType === 'screw' ? '螺杆式' : '活塞式';

  return {
    evapTemp, condTemp, suctionTemp: parseFloat(suctionTemp.toFixed(1)),
    refrigerant: refrigerant || 'R507',
    compressorType: compTypeName,
    econDesc: econDesc,
    actualCOP: parseFloat(actualCOP.toFixed(2)),
    compressorPower: parseFloat(compressorPower.toFixed(2)),
    displacement: parseFloat(displacement.toFixed(1)),
    q0: parseFloat(q0.toFixed(1)),
    qv: parseFloat(qv.toFixed(0)),
    v1: parseFloat(v1.toFixed(4)),
    volumetricEff: parseFloat(volumetricEff.toFixed(2)),
    pressureRatio: parseFloat(pressureRatio.toFixed(2)),
    suggestedCapacity: designKW,
    fanCapacity: parseFloat(fanCapacity.toFixed(2)),
    condenserHeat: parseFloat(condenserHeat.toFixed(2)),
    condenserType: condenserType,
    condenserFactor: condenserFactor,
    condenserCapacity: parseFloat(condenserCapacity.toFixed(2))
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
