/**
 * 冷库冷量计算小程序 - 主页面逻辑
 * 青岛冷锋节能工程有限公司
 */
const calc = require('../../utils/calculator.js');

Page({
  data: {
    activeTab: 'basic',
    tabs: [
      { key: 'basic', label: '基本信息' },
      { key: 'envelope', label: '围护结构' },
      { key: 'goods', label: '货物负荷' },
      { key: 'ventilation', label: '通风换气' },
      { key: 'operation', label: '操作管理' },
      { key: 'motor', label: '电机负荷' },
      { key: 'result', label: '计算结果' }
    ],
    roomName: '1#冷冻库',
    roomType: 'freezing',
    roomTypeIndex: 1,
    roomTypeOptions: ['冷藏库（0℃以上）', '冷冻库（-18℃）', '速冻库（-30℃以下）', '恒温库', '自定义'],
    roomTypeValues: ['cooling', 'freezing', 'deepfreeze', 'constant', 'custom'],
    indoorTemp: -18,
    outdoorTemp: 35,
    outdoorHumidity: 80,
    indoorHumidity: 85,
    roomLength: 20,
    roomWidth: 10,
    roomHeight: 6,
    safetyFactor: 10,
    roomVolume: 1200,
    totalArea: 760,
    presetMaterial: 'pu',
    presetMaterialIndex: 0,
    presetThickness: 100,
    presetThicknessIndex: 2,
    presetK: 0.225,
    materialOptions: [
      { value: 'pu', label: '聚氨酯板（PU）λ=0.023' },
      { value: 'pir', label: 'PIR板 λ=0.022' },
      { value: 'eps', label: '聚苯板（EPS）λ=0.040' },
      { value: 'xps', label: '挤塑板（XPS）λ=0.030' },
      { value: 'rockwool', label: '岩棉夹芯板 λ=0.040' },
      { value: 'stainless_steel', label: '不锈钢聚氨酯板 λ=0.023' }
    ],
    thicknessOptions: [50, 75, 100, 120, 150, 175, 200, 250],
    roofMaterial: 'pu', roofMaterialIndex: 0, roofThickness: 100, roofThicknessIndex: 2, roofK: 0.225,
    roofAlpha: 1.3, roofAlphaIndex: 2,
    roofAlphaOptions: ['无（室内顶棚）', '轻度日照', '中度日照（推荐）', '强烈日照'],
    roofAlphaValues: [1.0, 1.2, 1.3, 1.4], roofArea: 200,
    wallMaterial: 'pu', wallMaterialIndex: 0, wallThickness: 100, wallThicknessIndex: 2, wallK: 0.225,
    wallAlpha: 1.0, wallAlphaIndex: 0,
    wallAlphaOptions: ['标准（无强日照）', '轻度日照', '中度日照'],
    wallAlphaValues: [1.0, 1.1, 1.2], wallArea: 360,
    floorMaterial: 'pu', floorMaterialIndex: 0, floorThickness: 100, floorThicknessIndex: 2, floorK: 0.225,
    floorType: 0.5, floorTypeIndex: 0,
    floorTypeOptions: ['架空地板（半温差）', '直接接触土壤', '下方为常温空间', '下方为加热空间'],
    floorTypeValues: [0.5, 0.7, 1.0, 0.3], floorArea: 200,
    partitionArea: 0, partitionMaterial: 'pu', partitionMaterialIndex: 0,
    partitionThickness: 100, partitionThicknessIndex: 2, partitionK: 0.225, adjacentTemp: 0,
    goodsMass: 5000, goodsInTemp: 0, goodsOutTemp: -18, freezePoint: -1.5,
    cpAbove: 3.2, cpBelow: 1.7, latentHeat: 250, coolingTime: 24,
    packMass: 500, packCp: 1.5, packTemp: 35, containerMass: 0, containerCp: 0.5, containerTimes: 0,
    airChanges: 2, airDensity: 1.2, ventTime: 2,
    outdoorEnthalpy: 0, indoorEnthalpy: 0, enthalpyDiff: 0,
    personCount: 2, personHeat: 280, personTime: 4,
    lightingDensity: 5, lightingTime: 8,
    equipmentPower: 1.5, equipmentDiversity: 0.5, equipmentTime: 4,
    doorArea: 4, doorOpens: 20, doorDuration: 60, doorK: 15,
    fanMotorPower: 2.2, motorEfficiency: 0.8, motorTime: 18, otherMotorPower: 0,
    evapTemp: -25, condTemp: 40, copValue: 2.5,
    envelopeTotal: 0, envelopeTotalKW: 0, envelopeRows: [],
    goodsTotal: 0, goodsTotalKW: 0, goodsSensible: 0, goodsLatent: 0, packLoad: 0, containerLoad: 0,
    ventTotal: 0, ventTotalKW: 0,
    operationTotal: 0, operationTotalKW: 0, personTotal: 0, lightingTotal: 0, equipmentTotal: 0, doorTotal: 0,
    motorTotal: 0, motorTotalKW: 0,
    r1: 0, r2: 0, r3: 0, r4: 0, r5: 0,
    r1p: '0%', r2p: '0%', r3p: '0%', r4p: '0%', r5p: '0%',
    rTotal: 0, rDesign: 0, barData: [],
    compressorPower: 0, suggestedCapacity: 0, fanSuggestion: 0,
    companyName: '青岛冷锋节能工程有限公司', companyPhone: '13061468618', companyAddress: '山东省青岛市'
  },

  onLoad() {
    this.updateRoomInfo();
    this.updateAllKValues();
    this.updatePresetK();
    this.calculateAll();
  },

  switchTab(e) { this.setData({ activeTab: e.currentTarget.dataset.tab }); },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = parseFloat(e.detail.value) || 0;
    this.setData({ [field]: value });
    this.afterParamChange();
  },

  onTextInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: e.detail.value });
    this.afterParamChange();
  },

  afterParamChange() { this.updateRoomInfo(); this.calculateAll(); },

  onRoomTypeChange(e) {
    const idx = parseInt(e.detail.value);
    const type = this.data.roomTypeValues[idx];
    this.setData({ roomTypeIndex: idx, roomType: type });
    this.applyRoomTypePreset(type);
  },

  onPresetMaterialChange(e) {
    const idx = parseInt(e.detail.value);
    this.setData({ presetMaterialIndex: idx, presetMaterial: this.data.materialOptions[idx].value });
    this.updatePresetK(); this.calculateAll();
  },

  onPresetThicknessChange(e) {
    const idx = parseInt(e.detail.value);
    this.setData({ presetThicknessIndex: idx, presetThickness: this.data.thicknessOptions[idx] });
    this.updatePresetK(); this.calculateAll();
  },

  onMaterialChange(e) {
    const part = e.currentTarget.dataset.part;
    const idx = parseInt(e.detail.value);
    this.setData({ [`${part}MaterialIndex`]: idx, [`${part}Material`]: this.data.materialOptions[idx].value });
    this.updatePartKValue(part); this.calculateAll();
  },

  onThicknessChange(e) {
    const part = e.currentTarget.dataset.part;
    const idx = parseInt(e.detail.value);
    this.setData({ [`${part}ThicknessIndex`]: idx, [`${part}Thickness`]: this.data.thicknessOptions[idx] });
    this.updatePartKValue(part); this.calculateAll();
  },

  onRoofAlphaChange(e) {
    const idx = parseInt(e.detail.value);
    this.setData({ roofAlphaIndex: idx, roofAlpha: this.data.roofAlphaValues[idx] });
    this.calculateAll();
  },

  onWallAlphaChange(e) {
    const idx = parseInt(e.detail.value);
    this.setData({ wallAlphaIndex: idx, wallAlpha: this.data.wallAlphaValues[idx] });
    this.calculateAll();
  },

  onFloorTypeChange(e) {
    const idx = parseInt(e.detail.value);
    this.setData({ floorTypeIndex: idx, floorType: this.data.floorTypeValues[idx] });
    this.calculateAll();
  },

  updatePartKValue(part) {
    const k = calc.calculateKValue(this.data[`${part}Material`], this.data[`${part}Thickness`]);
    this.setData({ [`${part}K`]: parseFloat(k.toFixed(3)) });
  },

  updateAllKValues() {
    ['roof', 'wall', 'floor', 'partition'].forEach(p => this.updatePartKValue(p));
  },

  updatePresetK() {
    const k = calc.calculateKValue(this.data.presetMaterial, this.data.presetThickness);
    this.setData({ presetK: parseFloat(k.toFixed(3)) });
  },

  applyPresetToAll() {
    const updates = {};
    ['roof', 'wall', 'floor', 'partition'].forEach(part => {
      updates[`${part}Material`] = this.data.presetMaterial;
      updates[`${part}MaterialIndex`] = this.data.presetMaterialIndex;
      updates[`${part}Thickness`] = this.data.presetThickness;
      updates[`${part}ThicknessIndex`] = this.data.presetThicknessIndex;
    });
    this.setData(updates);
    this.updateAllKValues(); this.calculateAll();
    wx.showToast({ title: '已应用到所有部位', icon: 'success', duration: 1500 });
  },

  applyRoomTypePreset(type) {
    const updates = {};
    switch(type) {
      case 'cooling':
        updates.indoorTemp = 0; updates.cpAbove = 3.5; updates.cpBelow = 1.8;
        updates.latentHeat = 0; updates.freezePoint = -1;
        this.setEnvelopePreset(updates, 'pu', 100, 0); break;
      case 'freezing':
        updates.indoorTemp = -18; updates.cpAbove = 3.2; updates.cpBelow = 1.7;
        updates.latentHeat = 250; updates.freezePoint = -1.5;
        this.setEnvelopePreset(updates, 'pu', 100, 0); break;
      case 'deepfreeze':
        updates.indoorTemp = -30; updates.cpAbove = 3.0; updates.cpBelow = 1.6;
        updates.latentHeat = 250; updates.freezePoint = -1.5;
        this.setEnvelopePreset(updates, 'pu', 150, 4); break;
      case 'constant':
        updates.indoorTemp = 5; updates.cpAbove = 3.5; updates.cpBelow = 1.8;
        updates.latentHeat = 0; updates.freezePoint = 0;
        this.setEnvelopePreset(updates, 'pu', 75, 1); break;
    }
    this.setData(updates);
    this.updateAllKValues(); this.updatePresetK(); this.calculateAll();
  },

  setEnvelopePreset(updates, material, thickness, thicknessIdx) {
    updates.presetMaterial = material; updates.presetMaterialIndex = 0;
    updates.presetThickness = thickness; updates.presetThicknessIndex = thicknessIdx;
    ['roof', 'wall', 'floor', 'partition'].forEach(part => {
      updates[`${part}Material`] = material; updates[`${part}MaterialIndex`] = 0;
      updates[`${part}Thickness`] = thickness; updates[`${part}ThicknessIndex`] = thicknessIdx;
    });
  },

  updateRoomInfo() {
    const L = this.data.roomLength, W = this.data.roomWidth, H = this.data.roomHeight;
    this.setData({
      roomVolume: parseFloat((L*W*H).toFixed(1)),
      totalArea: parseFloat((2*(L*W+L*H+W*H)).toFixed(1)),
      roofArea: parseFloat((L*W).toFixed(2)),
      wallArea: parseFloat((2*(L+W)*H).toFixed(2)),
      floorArea: parseFloat((L*W).toFixed(2))
    });
  },

  getParams() {
    const d = this.data;
    return {
      roomName: d.roomName, roomType: d.roomType,
      indoorTemp: d.indoorTemp, outdoorTemp: d.outdoorTemp,
      outdoorHumidity: d.outdoorHumidity, indoorHumidity: d.indoorHumidity,
      roomLength: d.roomLength, roomWidth: d.roomWidth, roomHeight: d.roomHeight,
      safetyFactor: d.safetyFactor,
      roofK: d.roofK, wallK: d.wallK, floorK: d.floorK, partitionK: d.partitionK,
      roofAlpha: d.roofAlpha, wallAlpha: d.wallAlpha, floorAlpha: d.floorType,
      partitionArea: d.partitionArea, adjacentTemp: d.adjacentTemp,
      roofMaterial: d.roofMaterial, roofThickness: d.roofThickness,
      wallMaterial: d.wallMaterial, wallThickness: d.wallThickness,
      floorMaterial: d.floorMaterial, floorThickness: d.floorThickness,
      partitionMaterial: d.partitionMaterial, partitionThickness: d.partitionThickness,
      goodsMass: d.goodsMass, goodsInTemp: d.goodsInTemp, goodsOutTemp: d.goodsOutTemp,
      freezePoint: d.freezePoint, cpAbove: d.cpAbove, cpBelow: d.cpBelow,
      latentHeat: d.latentHeat, coolingTime: d.coolingTime,
      packMass: d.packMass, packCp: d.packCp, packTemp: d.packTemp,
      containerMass: d.containerMass, containerCp: d.containerCp, containerTimes: d.containerTimes,
      airChanges: d.airChanges, airDensity: d.airDensity, ventTime: d.ventTime,
      personCount: d.personCount, personHeat: d.personHeat, personTime: d.personTime,
      lightingDensity: d.lightingDensity, lightingTime: d.lightingTime,
      equipmentPower: d.equipmentPower, equipmentDiversity: d.equipmentDiversity, equipmentTime: d.equipmentTime,
      doorArea: d.doorArea, doorOpens: d.doorOpens, doorDuration: d.doorDuration, doorK: d.doorK,
      fanMotorPower: d.fanMotorPower, motorEfficiency: d.motorEfficiency, motorTime: d.motorTime,
      otherMotorPower: d.otherMotorPower,
      evapTemp: d.evapTemp, condTemp: d.condTemp, copValue: d.copValue
    };
  },

  calculateAll() {
    const params = this.getParams();
    const result = calc.calculateTotal(params);
    const selection = calc.calculateSelection(result, params);

    const envelopeRows = [
      { name: '屋顶/顶棚', area: result.envelope.roof.area.toFixed(2), material: calc.MATERIAL_NAMES[params.roofMaterial], thickness: result.envelope.roof.area > 0 ? params.roofThickness : '-', k: result.envelope.roof.k.toFixed(3), delta: result.envelope.roof.delta.toFixed(1), alpha: result.envelope.roof.alpha.toFixed(2), load: result.envelope.roof.load.toFixed(1) },
      { name: '外墙（四面）', area: result.envelope.wall.area.toFixed(2), material: calc.MATERIAL_NAMES[params.wallMaterial], thickness: result.envelope.wall.area > 0 ? params.wallThickness : '-', k: result.envelope.wall.k.toFixed(3), delta: result.envelope.wall.delta.toFixed(1), alpha: result.envelope.wall.alpha.toFixed(2), load: result.envelope.wall.load.toFixed(1) },
      { name: '地板', area: result.envelope.floor.area.toFixed(2), material: calc.MATERIAL_NAMES[params.floorMaterial], thickness: result.envelope.floor.area > 0 ? params.floorThickness : '-', k: result.envelope.floor.k.toFixed(3), delta: result.envelope.floor.delta.toFixed(1), alpha: result.envelope.floor.alpha.toFixed(2), load: result.envelope.floor.load.toFixed(1) },
      { name: '隔墙', area: result.envelope.partition.area.toFixed(2), material: calc.MATERIAL_NAMES[params.partitionMaterial], thickness: result.envelope.partition.area > 0 ? params.partitionThickness : '-', k: result.envelope.partition.k.toFixed(3), delta: result.envelope.partition.delta.toFixed(1), alpha: result.envelope.partition.alpha.toFixed(2), load: result.envelope.partition.load.toFixed(1) }
    ];

    const loads = [result.envelope.total, result.goods.total, result.ventilation.total, result.operation.total, result.motor.total];
    const labels = ['围护结构', '货物负荷', '通风换气', '操作管理', '电机热负荷'];
    const colors = ['#2a5298', '#e74c3c', '#27ae60', '#f39c12', '#9b59b6'];
    const total = result.totalW;
    const barData = labels.map((label, i) => ({
      label, pct: Math.max(total > 0 ? loads[i]/total*100 : 0, 2),
      kw: (loads[i]/1000).toFixed(2), color: colors[i]
    }));

    this.setData({
      envelopeTotal: result.envelope.total.toFixed(1),
      envelopeTotalKW: (result.envelope.total/1000).toFixed(2),
      envelopeRows,
      goodsSensible: result.goods.sensible.toFixed(1), goodsLatent: result.goods.latent.toFixed(1),
      packLoad: result.goods.pack.toFixed(1), containerLoad: result.goods.container.toFixed(1),
      goodsTotal: result.goods.total.toFixed(1), goodsTotalKW: (result.goods.total/1000).toFixed(2),
      outdoorEnthalpy: result.ventilation.hOut.toFixed(2), indoorEnthalpy: result.ventilation.hIn.toFixed(2),
      enthalpyDiff: result.ventilation.deltaH.toFixed(2),
      ventTotal: result.ventilation.total.toFixed(1), ventTotalKW: (result.ventilation.total/1000).toFixed(2),
      personTotal: result.operation.person.toFixed(1), lightingTotal: result.operation.lighting.toFixed(1),
      equipmentTotal: result.operation.equipment.toFixed(1), doorTotal: result.operation.door.toFixed(1),
      operationTotal: result.operation.total.toFixed(1), operationTotalKW: (result.operation.total/1000).toFixed(2),
      motorTotal: result.motor.total.toFixed(1), motorTotalKW: (result.motor.total/1000).toFixed(2),
      r1: (loads[0]/1000).toFixed(2), r2: (loads[1]/1000).toFixed(2),
      r3: (loads[2]/1000).toFixed(2), r4: (loads[3]/1000).toFixed(2), r5: (loads[4]/1000).toFixed(2),
      r1p: (total>0?loads[0]/total*100:0).toFixed(1)+'%', r2p: (total>0?loads[1]/total*100:0).toFixed(1)+'%',
      r3p: (total>0?loads[2]/total*100:0).toFixed(1)+'%', r4p: (total>0?loads[3]/total*100:0).toFixed(1)+'%',
      r5p: (total>0?loads[4]/total*100:0).toFixed(1)+'%',
      rTotal: result.totalKW.toFixed(2), rDesign: result.designKW.toFixed(2),
      barData,
      compressorPower: selection.compressorPower.toFixed(2),
      suggestedCapacity: selection.suggestedCapacity.toFixed(2),
      fanSuggestion: selection.fanCapacity.toFixed(2)
    });
    this._lastResult = { params, result, selection };
  },

  exportReport() {
    const data = this._lastResult;
    if (!data) { wx.showToast({ title: '请先完成计算', icon: 'none' }); return; }
    const { params, result, selection } = data;
    const date = new Date().toLocaleString('zh-CN');
    const getMatName = (key) => calc.MATERIAL_NAMES[params[key]] || params[key];
    const roomTypeMap = { cooling: '冷藏库', freezing: '冷冻库', deepfreeze: '速冻库', constant: '恒温库', custom: '自定义' };
    const report = `═══════════════════════════════════\n    青岛冷锋节能工程有限公司\n      冷库冷量计算报告\n═══════════════════════════════════\n生成时间：${date}\n库房名称：${params.roomName}\n库房类型：${roomTypeMap[params.roomType]||params.roomType}\n联系电话：13061468618（微信同号）\n\n一、库房基本参数\n  库房尺寸：${params.roomLength}m × ${params.roomWidth}m × ${params.roomHeight}m\n  库房容积：${(params.roomLength*params.roomWidth*params.roomHeight).toFixed(1)} m³\n  库内温度：${params.indoorTemp}℃\n  室外温度：${params.outdoorTemp}℃\n  安全系数：${params.safetyFactor}%\n\n二、围护结构保温配置\n  屋顶：${getMatName('roofMaterial')} ${params.roofThickness}mm，K=${params.roofK.toFixed(3)}\n  外墙：${getMatName('wallMaterial')} ${params.wallThickness}mm，K=${params.wallK.toFixed(3)}\n  地板：${getMatName('floorMaterial')} ${params.floorThickness}mm，K=${params.floorK.toFixed(3)}\n\n三、各项冷负荷\n  ① 围护结构：${(result.envelope.total/1000).toFixed(2)} kW\n  ② 货物冷负荷：${(result.goods.total/1000).toFixed(2)} kW\n  ③ 通风换气：${(result.ventilation.total/1000).toFixed(2)} kW\n  ④ 操作管理：${(result.operation.total/1000).toFixed(2)} kW\n  ⑤ 电机热负荷：${(result.motor.total/1000).toFixed(2)} kW\n\n四、冷量汇总\n  计算总冷负荷：${result.totalKW.toFixed(2)} kW\n  设计冷量（含${params.safetyFactor}%安全系数）：${result.designKW.toFixed(2)} kW\n\n五、设备选型参考\n  蒸发温度：${selection.evapTemp}℃\n  冷凝温度：${selection.condTemp}℃\n  COP：${selection.cop}\n  压缩机轴功率：${selection.compressorPower.toFixed(2)} kW\n  建议制冷量：${selection.suggestedCapacity.toFixed(2)} kW\n  冷风机建议：${selection.fanCapacity.toFixed(2)} kW\n\n═══════════════════════════════════\n  青岛冷锋节能工程有限公司\n  电话/微信：13061468618\n  专业冷库设计·安装·节能改造\n───────────────────────────────────\n  计算结果仅供参考，实际工程请由\n  专业制冷工程师审核确认。\n═══════════════════════════════════`;
    wx.setClipboardData({
      data: report,
      success: () => { wx.showModal({ title: '报告已复制', content: '计算报告已复制到剪贴板，可粘贴到微信或备忘录中保存。', showCancel: false }); }
    });
  },

  makeCall() { wx.makePhoneCall({ phoneNumber: '13061468618' }); },

  resetAll() {
    wx.showModal({
      title: '确认重置', content: '确定要重置所有参数吗？',
      success: (res) => { if (res.confirm) wx.reLaunch({ url: '/pages/index/index' }); }
    });
  }
});
