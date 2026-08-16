/**
 * 冷库冷量计算软件 v1.1 - 界面交互逻辑
 * 青岛冷锋节能工程有限公司
 */

// DOM 元素缓存
const elements = {};

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    initElements();
    initTabs();
    initEventListeners();
    updateRoomInfo();
    updateAllKValues();
    updatePresetK();
    calculateAll();
});

// 初始化元素引用
function initElements() {
    const ids = [
        // 基本信息
        'roomName', 'roomType', 'indoorTemp', 'outdoorTemp', 'outdoorHumidity', 'indoorHumidity',
        'roomLength', 'roomWidth', 'roomHeight', 'safetyFactor',
        // 围护结构 - 预设
        'presetMaterial', 'presetThickness', 'presetK',
        // 围护结构 - 屋顶
        'roofMaterial', 'roofThickness', 'roofK', 'roofAlpha', 'roofArea',
        // 围护结构 - 外墙
        'wallMaterial', 'wallThickness', 'wallK', 'wallAlpha', 'wallArea',
        // 围护结构 - 地板
        'floorMaterial', 'floorThickness', 'floorK', 'floorType', 'floorAreaDisplay',
        // 围护结构 - 隔墙
        'partitionAreaInput', 'partitionMaterial', 'partitionThickness', 'partitionK', 'adjacentTemp',
        // 货物负荷
        'goodsMass', 'goodsInTemp', 'goodsOutTemp', 'freezePoint',
        'cpAbove', 'cpBelow', 'latentHeat', 'coolingTime',
        'packMass', 'packCp', 'packTemp', 'containerMass', 'containerCp', 'containerTimes',
        // 通风换气
        'airChanges', 'airDensity', 'ventTime',
        // 操作管理
        'personCount', 'personHeat', 'personTime',
        'lightingDensity', 'lightingTime',
        'equipmentPower', 'equipmentDiversity', 'equipmentTime',
        'doorArea', 'doorOpens', 'doorDuration', 'doorK',
        // 电机热负荷
        'fanMotorPower', 'motorEfficiency', 'motorTime', 'otherMotorPower',
        // 设备选型
        'evapTemp', 'condTemp', 'copValue'
    ];
    ids.forEach(id => {
        elements[id] = document.getElementById(id);
    });
}

// 标签页切换
function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const tab = this.dataset.tab;
            switchTab(tab);
        });
    });
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector(`.tab-btn[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`tab-${tabName}`).classList.add('active');
}

// 事件监听
function initEventListeners() {
    // 所有输入框变化时重新计算
    const allInputs = document.querySelectorAll('input, select');
    allInputs.forEach(input => {
        input.addEventListener('input', () => {
            updateRoomInfo();
            calculateAll();
        });
        input.addEventListener('change', () => {
            updateRoomInfo();
            calculateAll();
        });
    });

    // 库房类型预设
    elements.roomType.addEventListener('change', function() {
        applyRoomTypePreset(this.value);
    });

    // 保温材料和厚度变化时自动计算K值
    const materialSelects = document.querySelectorAll('.material-select');
    const thicknessSelects = document.querySelectorAll('.thickness-select');

    materialSelects.forEach(sel => {
        sel.addEventListener('change', function() {
            const part = this.id.replace('Material', '');
            updatePartKValue(part);
            calculateAll();
        });
    });

    thicknessSelects.forEach(sel => {
        sel.addEventListener('change', function() {
            const part = this.id.replace('Thickness', '');
            updatePartKValue(part);
            calculateAll();
        });
    });

    // 预设区域变化时更新预览
    elements.presetMaterial.addEventListener('change', updatePresetK);
    elements.presetThickness.addEventListener('change', updatePresetK);
}

/**
 * 更新单个部位的K值（根据材料和厚度自动计算）
 */
function updatePartKValue(part) {
    const materialEl = document.getElementById(part + 'Material');
    const thicknessEl = document.getElementById(part + 'Thickness');
    const kEl = document.getElementById(part + 'K');

    if (!materialEl || !thicknessEl || !kEl) return;

    const material = materialEl.value;
    const thickness = parseFloat(thicknessEl.value);

    if (material !== 'custom') {
        const k = ColdStorageCalculator.calculateKValue(material, thickness);
        kEl.value = k.toFixed(3);
    }
}

/**
 * 更新所有部位的K值
 */
function updateAllKValues() {
    ['roof', 'wall', 'floor', 'partition'].forEach(part => {
        updatePartKValue(part);
    });
}

/**
 * 更新预设区域的K值预览
 */
function updatePresetK() {
    const material = elements.presetMaterial.value;
    const thickness = parseFloat(elements.presetThickness.value);
    const k = ColdStorageCalculator.calculateKValue(material, thickness);
    elements.presetK.textContent = k.toFixed(3);
}

/**
 * 一键应用保温材料和厚度到所有部位
 */
function applyPresetToAll() {
    const material = elements.presetMaterial.value;
    const thickness = elements.presetThickness.value;

    ['roof', 'wall', 'floor', 'partition'].forEach(part => {
        const materialEl = document.getElementById(part + 'Material');
        const thicknessEl = document.getElementById(part + 'Thickness');
        if (materialEl) materialEl.value = material;
        if (thicknessEl) thicknessEl.value = thickness;
        updatePartKValue(part);
    });

    updatePresetK();
    calculateAll();

    // 视觉反馈
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = '✓ 已应用到所有部位';
    btn.style.background = 'linear-gradient(135deg, #2e7d32 0%, #1b5e20 100%)';
    setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = '';
    }, 1500);
}

// 库房类型预设
function applyRoomTypePreset(type) {
    switch(type) {
        case 'cooling':
            elements.indoorTemp.value = 0;
            elements.cpAbove.value = 3.5;
            elements.cpBelow.value = 1.8;
            elements.latentHeat.value = 0;
            elements.freezePoint.value = -1;
            // 保温预设：100mm 聚氨酯板
            setEnvelopePreset('pu', '100');
            break;
        case 'freezing':
            elements.indoorTemp.value = -18;
            elements.cpAbove.value = 3.2;
            elements.cpBelow.value = 1.7;
            elements.latentHeat.value = 250;
            elements.freezePoint.value = -1.5;
            // 保温预设：100mm 聚氨酯板
            setEnvelopePreset('pu', '100');
            break;
        case 'deepfreeze':
            elements.indoorTemp.value = -30;
            elements.cpAbove.value = 3.0;
            elements.cpBelow.value = 1.6;
            elements.latentHeat.value = 250;
            elements.freezePoint.value = -1.5;
            // 保温预设：150mm 聚氨酯板
            setEnvelopePreset('pu', '150');
            break;
        case 'constant':
            elements.indoorTemp.value = 5;
            elements.cpAbove.value = 3.5;
            elements.cpBelow.value = 1.8;
            elements.latentHeat.value = 0;
            elements.freezePoint.value = 0;
            // 保温预设：75mm 聚氨酯板
            setEnvelopePreset('pu', '75');
            break;
    }
    updateAllKValues();
    calculateAll();
}

/**
 * 设置围护结构保温材料预设（应用到所有部位）
 */
function setEnvelopePreset(material, thickness) {
    elements.presetMaterial.value = material;
    elements.presetThickness.value = thickness;
    ['roof', 'wall', 'floor', 'partition'].forEach(part => {
        const mEl = document.getElementById(part + 'Material');
        const tEl = document.getElementById(part + 'Thickness');
        if (mEl && mEl.value !== 'custom') mEl.value = material;
        if (tEl) tEl.value = thickness;
    });
    updatePresetK();
}

// 获取所有参数
function getParams() {
    const getVal = (id) => parseFloat(elements[id]?.value) || 0;
    const getStr = (id) => elements[id]?.value || '';

    return {
        roomName: getStr('roomName'),
        roomType: getStr('roomType'),
        indoorTemp: getVal('indoorTemp'),
        outdoorTemp: getVal('outdoorTemp'),
        outdoorHumidity: getVal('outdoorHumidity'),
        indoorHumidity: getVal('indoorHumidity'),
        roomLength: getVal('roomLength'),
        roomWidth: getVal('roomWidth'),
        roomHeight: getVal('roomHeight'),
        safetyFactor: getVal('safetyFactor'),

        // 围护结构
        roofK: getVal('roofK'),
        wallK: getVal('wallK'),
        floorK: getVal('floorK'),
        partitionK: getVal('partitionK'),
        roofAlpha: getVal('roofAlpha'),
        wallAlpha: getVal('wallAlpha'),
        floorAlpha: getVal('floorType'),
        partitionArea: getVal('partitionAreaInput'),
        adjacentTemp: getVal('adjacentTemp'),

        // 保温材料信息（用于报告导出）
        roofMaterial: getStr('roofMaterial'),
        roofThickness: getVal('roofThickness'),
        wallMaterial: getStr('wallMaterial'),
        wallThickness: getVal('wallThickness'),
        floorMaterial: getStr('floorMaterial'),
        floorThickness: getVal('floorThickness'),
        partitionMaterial: getStr('partitionMaterial'),
        partitionThickness: getVal('partitionThickness'),

        // 货物负荷
        goodsMass: getVal('goodsMass'),
        goodsInTemp: getVal('goodsInTemp'),
        goodsOutTemp: getVal('goodsOutTemp'),
        freezePoint: getVal('freezePoint'),
        cpAbove: getVal('cpAbove'),
        cpBelow: getVal('cpBelow'),
        latentHeat: getVal('latentHeat'),
        coolingTime: getVal('coolingTime'),
        packMass: getVal('packMass'),
        packCp: getVal('packCp'),
        packTemp: getVal('packTemp'),
        containerMass: getVal('containerMass'),
        containerCp: getVal('containerCp'),
        containerTimes: getVal('containerTimes'),

        // 通风换气
        airChanges: getVal('airChanges'),
        airDensity: getVal('airDensity'),
        ventTime: getVal('ventTime'),

        // 操作管理
        personCount: getVal('personCount'),
        personHeat: getVal('personHeat'),
        personTime: getVal('personTime'),
        lightingDensity: getVal('lightingDensity'),
        lightingTime: getVal('lightingTime'),
        equipmentPower: getVal('equipmentPower'),
        equipmentDiversity: getVal('equipmentDiversity'),
        equipmentTime: getVal('equipmentTime'),
        doorArea: getVal('doorArea'),
        doorOpens: getVal('doorOpens'),
        doorDuration: getVal('doorDuration'),
        doorK: getVal('doorK'),

        // 电机热负荷
        fanMotorPower: getVal('fanMotorPower'),
        motorEfficiency: getVal('motorEfficiency'),
        motorTime: getVal('motorTime'),
        otherMotorPower: getVal('otherMotorPower'),

        // 设备选型
        evapTemp: getVal('evapTemp'),
        condTemp: getVal('condTemp'),
        copValue: getVal('copValue')
    };
}

// 更新库房基本信息和各部位面积
function updateRoomInfo() {
    const L = parseFloat(elements.roomLength.value) || 0;
    const W = parseFloat(elements.roomWidth.value) || 0;
    const H = parseFloat(elements.roomHeight.value) || 0;

    const volume = L * W * H;
    const totalArea = 2 * (L * W + L * H + W * H);
    const roofArea = L * W;
    const wallArea = 2 * (L + W) * H;

    document.getElementById('roomVolume').textContent = volume.toFixed(1);
    document.getElementById('totalArea').textContent = totalArea.toFixed(1);

    // 更新各部位面积显示
    if (elements.roofArea) elements.roofArea.textContent = roofArea.toFixed(2);
    if (elements.wallArea) elements.wallArea.textContent = wallArea.toFixed(2);
    if (elements.floorAreaDisplay) elements.floorAreaDisplay.textContent = roofArea.toFixed(2);

    const partArea = parseFloat(elements.partitionAreaInput?.value) || 0;
    const partSpan = document.querySelector('#tab-envelope .config-row:nth-child(4) .config-area span');
    if (partSpan) partSpan.textContent = partArea.toFixed(2);
}

// 更新围护结构表格
function updateEnvelopeTable(envelope, params) {
    const tbody = document.getElementById('envelopeBody');
    const rows = [
        {
            name: '屋顶/顶棚',
            data: envelope.roof,
            material: params?.roofMaterial || 'pu',
            thickness: params?.roofThickness || 100
        },
        {
            name: '外墙（四面）',
            data: envelope.wall,
            material: params?.wallMaterial || 'pu',
            thickness: params?.wallThickness || 100
        },
        {
            name: '地板',
            data: envelope.floor,
            material: params?.floorMaterial || 'pu',
            thickness: params?.floorThickness || 100
        },
        {
            name: '隔墙',
            data: envelope.partition,
            material: params?.partitionMaterial || 'pu',
            thickness: params?.partitionThickness || 100
        }
    ];

    tbody.innerHTML = rows.map(row => {
        const matName = ColdStorageCalculator.MATERIAL_NAMES[row.material] || row.material;
        const displayThickness = row.data.area > 0 ? row.thickness : '-';
        return `
        <tr>
            <td>${row.name}</td>
            <td>${row.data.area.toFixed(2)}</td>
            <td>${matName}</td>
            <td>${displayThickness}</td>
            <td>${row.data.k.toFixed(3)}</td>
            <td>${row.data.delta.toFixed(1)}</td>
            <td>${row.data.alpha.toFixed(2)}</td>
            <td><strong>${row.data.load.toFixed(1)}</strong></td>
        </tr>
    `}).join('');
}

// 格式化数字
function fmt(val, decimals = 1) {
    return Number(val).toFixed(decimals);
}

// 主计算函数
function calculateAll() {
    const params = getParams();
    const result = ColdStorageCalculator.calculateTotal(params);
    const selection = ColdStorageCalculator.calculateSelection(result, params);

    // 围护结构
    updateEnvelopeTable(result.envelope, params);
    document.getElementById('envelopeTotal').textContent = fmt(result.envelope.total);
    document.getElementById('envelopeTotalKW').textContent = fmt(result.envelope.total / 1000, 2);

    // 货物负荷
    document.getElementById('goodsSensible').textContent = fmt(result.goods.sensible);
    document.getElementById('goodsLatent').textContent = fmt(result.goods.latent);
    document.getElementById('packLoad').textContent = fmt(result.goods.pack);
    document.getElementById('containerLoad').textContent = fmt(result.goods.container);
    document.getElementById('goodsTotal').textContent = fmt(result.goods.total);
    document.getElementById('goodsTotalKW').textContent = fmt(result.goods.total / 1000, 2);

    // 通风换气
    document.getElementById('outdoorEnthalpy').textContent = fmt(result.ventilation.hOut, 2);
    document.getElementById('indoorEnthalpy').textContent = fmt(result.ventilation.hIn, 2);
    document.getElementById('enthalpyDiff').textContent = fmt(result.ventilation.deltaH, 2);
    document.getElementById('ventTotal').textContent = fmt(result.ventilation.total);
    document.getElementById('ventTotalKW').textContent = fmt(result.ventilation.total / 1000, 2);

    // 操作管理
    document.getElementById('personTotal').textContent = fmt(result.operation.person);
    document.getElementById('lightingTotal').textContent = fmt(result.operation.lighting);
    document.getElementById('equipmentTotal').textContent = fmt(result.operation.equipment);
    document.getElementById('doorTotal').textContent = fmt(result.operation.door);
    document.getElementById('operationTotal').textContent = fmt(result.operation.total);
    document.getElementById('operationTotalKW').textContent = fmt(result.operation.total / 1000, 2);

    // 电机热负荷
    document.getElementById('motorTotal').textContent = fmt(result.motor.total);
    document.getElementById('motorTotalKW').textContent = fmt(result.motor.total / 1000, 2);

    // 结果汇总
    const loads = [
        result.envelope.total,
        result.goods.total,
        result.ventilation.total,
        result.operation.total,
        result.motor.total
    ];
    const total = result.totalW;

    document.getElementById('r1').textContent = fmt(loads[0] / 1000, 2);
    document.getElementById('r2').textContent = fmt(loads[1] / 1000, 2);
    document.getElementById('r3').textContent = fmt(loads[2] / 1000, 2);
    document.getElementById('r4').textContent = fmt(loads[3] / 1000, 2);
    document.getElementById('r5').textContent = fmt(loads[4] / 1000, 2);
    document.getElementById('rTotal').textContent = fmt(result.totalKW, 2);
    document.getElementById('rDesign').textContent = fmt(result.designKW, 2);

    // 百分比
    for (let i = 0; i < 5; i++) {
        const pct = total > 0 ? (loads[i] / total * 100) : 0;
        document.getElementById(`r${i+1}p`).textContent = pct.toFixed(1) + '%';
    }

    // 柱状图
    updateBarChart(loads, total);

    // 设备选型
    document.getElementById('compressorPower').textContent = fmt(selection.compressorPower, 2);
    document.getElementById('suggestedCapacity').textContent = fmt(selection.suggestedCapacity, 2);
    document.getElementById('fanSuggestion').textContent = fmt(selection.fanCapacity, 2);

    // 保存结果供导出
    window._lastResult = { params, result, selection };
}

// 更新柱状图
function updateBarChart(loads, total) {
    const labels = ['围护结构', '货物负荷', '通风换气', '操作管理', '电机热负荷'];
    const colors = ['#2a5298', '#e74c3c', '#27ae60', '#f39c12', '#9b59b6'];
    const chart = document.getElementById('barChart');

    chart.innerHTML = labels.map((label, i) => {
        const pct = total > 0 ? (loads[i] / total * 100) : 0;
        const kw = loads[i] / 1000;
        return `
            <div class="bar-row">
                <div class="bar-label">${label}</div>
                <div class="bar-track">
                    <div class="bar-fill" style="width: ${Math.max(pct, 2)}%; background: ${colors[i]};">
                        ${kw.toFixed(2)}kW
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// 导出计算报告
function exportReport() {
    const data = window._lastResult;
    if (!data) {
        alert('请先完成计算');
        return;
    }

    const { params, result, selection } = data;
    const date = new Date().toLocaleString('zh-CN');

    const getMatName = (key) => ColdStorageCalculator.MATERIAL_NAMES[params[key]] || params[key];

    const report = `
═══════════════════════════════════════════
        青岛冷锋节能工程有限公司
           冷库冷量计算报告
═══════════════════════════════════════════
生成时间：${date}
库房名称：${params.roomName}
库房类型：${getRoomTypeName(params.roomType)}
联系电话：13061468618（微信同号）

一、库房基本参数
───────────────────────────────────────────
  库房尺寸：${params.roomLength}m × ${params.roomWidth}m × ${params.roomHeight}m
  库房容积：${(params.roomLength * params.roomWidth * params.roomHeight).toFixed(1)} m³
  库内温度：${params.indoorTemp}℃
  室外温度：${params.outdoorTemp}℃
  安全系数：${params.safetyFactor}%

二、围护结构保温配置
───────────────────────────────────────────
  屋顶/顶棚：${getMatName('roofMaterial')} ${params.roofThickness}mm
             K=${params.roofK.toFixed(3)} W/(m²·K)
             面积=${result.envelope.roof.area.toFixed(2)}m²
  外墙：    ${getMatName('wallMaterial')} ${params.wallThickness}mm
             K=${params.wallK.toFixed(3)} W/(m²·K)
             面积=${result.envelope.wall.area.toFixed(2)}m²
  地板：    ${getMatName('floorMaterial')} ${params.floorThickness}mm
             K=${params.floorK.toFixed(3)} W/(m²·K)
             面积=${result.envelope.floor.area.toFixed(2)}m²
  ${params.partitionArea > 0 ? `隔墙：    ${getMatName('partitionMaterial')} ${params.partitionThickness}mm
             K=${params.partitionK.toFixed(3)} W/(m²·K)
             面积=${result.envelope.partition.area.toFixed(2)}m²` : '隔墙：    无'}

三、各项冷负荷计算
───────────────────────────────────────────
  ① 围护结构传热负荷：${(result.envelope.total/1000).toFixed(2)} kW
     - 屋顶：${(result.envelope.roof.load/1000).toFixed(2)} kW
     - 外墙：${(result.envelope.wall.load/1000).toFixed(2)} kW
     - 地板：${(result.envelope.floor.load/1000).toFixed(2)} kW
     ${params.partitionArea > 0 ? `- 隔墙：${(result.envelope.partition.load/1000).toFixed(2)} kW` : ''}

  ② 货物冷负荷：${(result.goods.total/1000).toFixed(2)} kW
     - 货物显热：${(result.goods.sensible/1000).toFixed(2)} kW
     - 货物潜热：${(result.goods.latent/1000).toFixed(2)} kW
     - 包装材料：${(result.goods.pack/1000).toFixed(2)} kW

  ③ 通风换气冷负荷：${(result.ventilation.total/1000).toFixed(2)} kW

  ④ 操作管理冷负荷：${(result.operation.total/1000).toFixed(2)} kW
     - 人员散热：${(result.operation.person/1000).toFixed(2)} kW
     - 照明散热：${(result.operation.lighting/1000).toFixed(2)} kW
     - 设备散热：${(result.operation.equipment/1000).toFixed(2)} kW
     - 开门热负荷：${(result.operation.door/1000).toFixed(2)} kW

  ⑤ 电机运行热负荷：${(result.motor.total/1000).toFixed(2)} kW

四、冷量汇总
───────────────────────────────────────────
  计算总冷负荷：${result.totalKW.toFixed(2)} kW
  设计冷量（含${params.safetyFactor}%安全系数）：${result.designKW.toFixed(2)} kW

五、制冷设备选型参考
───────────────────────────────────────────
  蒸发温度：${selection.evapTemp}℃
  冷凝温度：${selection.condTemp}℃
  制冷系数COP：${selection.cop}
  压缩机轴功率：${selection.compressorPower.toFixed(2)} kW
  建议配置制冷量：${selection.suggestedCapacity.toFixed(2)} kW
  冷风机建议配置：${selection.fanCapacity.toFixed(2)} kW

═══════════════════════════════════════════
  青岛冷锋节能工程有限公司
  电话/微信：13061468618
  专业冷库设计 · 安装 · 节能改造
───────────────────────────────────────────
  本报告由冷库冷量计算软件自动生成
  计算结果仅供参考，实际工程请由专业
  制冷工程师审核确认。
═══════════════════════════════════════════
`;

    // 下载文件
    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `冷库冷量计算报告_${params.roomName}_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
}

function getRoomTypeName(type) {
    const map = {
        cooling: '冷藏库',
        freezing: '冷冻库',
        deepfreeze: '速冻库',
        constant: '恒温库',
        custom: '自定义'
    };
    return map[type] || type;
}

// 打印结果
function printResult() {
    switchTab('result');
    setTimeout(() => window.print(), 300);
}

// 重置参数
function resetAll() {
    if (!confirm('确定要重置所有参数吗？')) return;
    location.reload();
}