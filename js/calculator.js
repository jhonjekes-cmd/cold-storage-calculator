/**
 * 冷库冷量计算核心模块
 * 依据《冷库设计标准》GB 50072 相关公式
 */

const ColdStorageCalculator = {
    /**
     * 保温材料导热系数表 [W/(m·K)]
     */
    MATERIAL_LAMBDA: {
        pu: 0.023,           // 双面彩钢聚氨酯板（PU）
        pir: 0.022,          // 双面彩钢聚氨酯板（PIR）
        eps: 0.040,          // 双面彩钢聚苯板（EPS）
        xps: 0.030,          // 挤塑聚苯板（XPS）
        rockwool: 0.040,     // 岩棉夹芯板
        stainless_steel: 0.023 // 不锈钢聚氨酯板
    },

    /**
     * 材料中文名称映射
     */
    MATERIAL_NAMES: {
        pu: '聚氨酯板(PU)',
        pir: '聚氨酯板(PIR)',
        eps: '聚苯板(EPS)',
        xps: '挤塑板(XPS)',
        rockwool: '岩棉板',
        stainless_steel: '不锈钢聚氨酯板',
        custom: '自定义'
    },

    /**
     * 根据保温材料和厚度计算传热系数K
     * K = 1 / (δ/λ + Rsi + Rso)
     * Rsi = 0.11 m²·K/W (内表面换热阻)
     * Rso = 0.04 m²·K/W (外表面换热阻)
     * @param {string} material - 材料类型
     * @param {number} thickness - 厚度 mm
     * @param {number} customLambda - 自定义导热系数（material=custom时使用）
     * @returns {number} K值 W/(m²·K)
     */
    calculateKValue(material, thickness, customLambda = 0.023) {
        const lambda = material === 'custom' ? customLambda : (this.MATERIAL_LAMBDA[material] || 0.023);
        const delta = thickness / 1000; // mm -> m
        const Rsi = 0.11;
        const Rso = 0.04;
        const totalResistance = delta / lambda + Rsi + Rso;
        return 1 / totalResistance;
    },

    /**
     * 计算湿空气焓值
     * h = 1.005*t + d*(2501 + 1.86*t)  kJ/kg干空气
     * @param {number} temp - 温度 ℃
     * @param {number} rh - 相对湿度 %
     * @returns {number} 焓值 kJ/kg
     */
    calculateEnthalpy(temp, rh) {
        // 饱和水蒸气压力 (Pa) - Magnus公式
        const es = 611.2 * Math.exp((17.67 * temp) / (temp + 243.5));
        // 水蒸气分压力
        const e = es * (rh / 100);
        // 含湿量 d (kg/kg干空气)
        const d = 0.622 * e / (101325 - e);
        // 焓值
        const h = 1.005 * temp + d * (2501 + 1.86 * temp);
        return h;
    },

    /**
     * 围护结构传热负荷计算
     * Q1 = K * F * Δt * α
     * 支持各部位独立保温材料、厚度和修正系数
     */
    calculateEnvelope(params) {
        const {
            roomLength, roomWidth, roomHeight,
            indoorTemp, outdoorTemp,
            roofK, wallK, floorK, partitionK,
            roofAlpha, wallAlpha, floorAlpha,
            partitionArea, adjacentTemp
        } = params;

        // 各部位面积
        const roofArea = roomLength * roomWidth;
        const floorArea = roomLength * roomWidth;
        const wallArea = 2 * (roomLength + roomWidth) * roomHeight;
        const partArea = partitionArea || 0;

        // 温差
        const outdoorDelta = outdoorTemp - indoorTemp;
        const adjacentDelta = Math.max(0, (adjacentTemp || 0) - indoorTemp);

        // 各部位传热量
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
    },

    /**
     * 货物冷负荷计算
     * 包含：冷却显热 + 冻结潜热 + 包装材料 + 运载工具
     */
    calculateGoods(params) {
        const {
            goodsMass, goodsInTemp, goodsOutTemp, freezePoint,
            cpAbove, cpBelow, latentHeat, coolingTime,
            packMass, packCp, packTemp,
            containerMass, containerCp, containerTimes
        } = params;

        const timeSeconds = coolingTime * 3600;

        // 货物显热（冷却到冻结点）
        let sensibleHeat = 0;
        if (goodsInTemp > freezePoint) {
            const deltaAbove = Math.min(goodsInTemp, freezePoint + 100) - freezePoint;
            sensibleHeat = goodsMass * cpAbove * Math.max(0, goodsInTemp - freezePoint) * 1000 / timeSeconds;
        }

        // 货物潜热（冻结）
        let latentLoad = 0;
        if (goodsOutTemp <= freezePoint && goodsInTemp > goodsOutTemp) {
            latentLoad = goodsMass * latentHeat * 1000 / timeSeconds;
        }

        // 冻结后冷却显热
        let subcoolHeat = 0;
        if (goodsOutTemp < freezePoint) {
            subcoolHeat = goodsMass * cpBelow * (freezePoint - goodsOutTemp) * 1000 / timeSeconds;
        }

        const goodsTotal = sensibleHeat + latentLoad + subcoolHeat;

        // 包装材料冷负荷
        const packLoad = packMass * packCp * Math.max(0, packTemp - goodsOutTemp) * 1000 / timeSeconds;

        // 运载工具冷负荷
        const containerDailyMass = containerMass * containerTimes;
        const containerLoad = containerDailyMass * containerCp * Math.max(0, packTemp - goodsOutTemp) * 1000 / timeSeconds;

        const total = goodsTotal + packLoad + containerLoad;

        return {
            sensible: sensibleHeat + subcoolHeat,
            latent: latentLoad,
            goodsTotal: goodsTotal,
            pack: packLoad,
            container: containerLoad,
            total: total
        };
    },

    /**
     * 通风换气冷负荷
     * Q3 = n * V * ρ * (h_w - h_n) / (24 * 3600) * 运行时间系数
     */
    calculateVentilation(params) {
        const {
            roomLength, roomWidth, roomHeight,
            indoorTemp, indoorHumidity,
            outdoorTemp, outdoorHumidity,
            airChanges, airDensity, ventTime
        } = params;

        const roomVolume = roomLength * roomWidth * roomHeight;
        const hOut = this.calculateEnthalpy(outdoorTemp, outdoorHumidity);
        const hIn = this.calculateEnthalpy(indoorTemp, indoorHumidity);
        const deltaH = Math.max(0, hOut - hIn);

        // 每日换气带入的总热量 (kJ/d)
        const dailyHeat = airChanges * roomVolume * airDensity * deltaH;
        // 平均到全天 (W)
        const avgLoad = dailyHeat * 1000 / (24 * 3600);

        // 按通风时间折算（峰值更高，这里取平均）
        const timeFactor = ventTime / 24;
        const peakLoad = dailyHeat * 1000 / (ventTime * 3600);

        return {
            hOut: hOut,
            hIn: hIn,
            deltaH: deltaH,
            roomVolume: roomVolume,
            avgLoad: avgLoad,
            peakLoad: peakLoad,
            total: avgLoad // 设计取平均值
        };
    },

    /**
     * 操作管理冷负荷
     * 包含：人员散热 + 照明散热 + 设备散热 + 开门热负荷
     */
    calculateOperation(params) {
        const {
            roomLength, roomWidth,
            personCount, personHeat, personTime,
            lightingDensity, lightingTime,
            equipmentPower, equipmentDiversity, equipmentTime,
            doorArea, doorOpens, doorDuration, doorK,
            indoorTemp, outdoorTemp
        } = params;

        const floorArea = roomLength * roomWidth;
        const deltaT = outdoorTemp - indoorTemp;

        // 人员散热（平均到24小时）
        const personTotal = personCount * personHeat * (personTime / 24);

        // 照明散热
        const lightingTotal = lightingDensity * floorArea * (lightingTime / 24);

        // 设备散热
        const equipmentTotal = equipmentPower * 1000 * equipmentDiversity * (equipmentTime / 24);

        // 开门热负荷
        // Q = K * F * Δt * 开门时间占比
        const doorOpenSecondsPerDay = doorOpens * doorDuration;
        const doorTimeRatio = doorOpenSecondsPerDay / (24 * 3600);
        const doorTotal = doorK * doorArea * deltaT * doorTimeRatio;

        const total = personTotal + lightingTotal + equipmentTotal + doorTotal;

        return {
            person: personTotal,
            lighting: lightingTotal,
            equipment: equipmentTotal,
            door: doorTotal,
            total: total
        };
    },

    /**
     * 电机运行热负荷
     * Q5 = P * η * (运行时间/24)
     */
    calculateMotor(params) {
        const {
            fanMotorPower, motorEfficiency, motorTime,
            otherMotorPower
        } = params;

        const fanLoad = fanMotorPower * 1000 * motorEfficiency * (motorTime / 24);
        const otherLoad = otherMotorPower * 1000 * motorEfficiency * (motorTime / 24);
        const total = fanLoad + otherLoad;

        return {
            fan: fanLoad,
            other: otherLoad,
            total: total
        };
    },

    /**
     * 总冷量计算
     */
    calculateTotal(params) {
        const envelope = this.calculateEnvelope(params);
        const goods = this.calculateGoods(params);
        const ventilation = this.calculateVentilation(params);
        const operation = this.calculateOperation(params);
        const motor = this.calculateMotor(params);

        const totalW = envelope.total + goods.total + ventilation.total + operation.total + motor.total;
        const totalKW = totalW / 1000;

        const safetyFactor = params.safetyFactor / 100;
        const designKW = totalKW * (1 + safetyFactor);

        return {
            envelope: envelope,
            goods: goods,
            ventilation: ventilation,
            operation: operation,
            motor: motor,
            totalW: totalW,
            totalKW: totalKW,
            designKW: designKW,
            safetyFactor: safetyFactor
        };
    },

    /**
     * 设备选型计算
     */
    calculateSelection(result, params) {
        const { evapTemp, condTemp, copValue } = params;
        const designKW = result.designKW;

        // 压缩机轴功率
        const compressorPower = designKW / copValue;

        // 冷风机配置（1.2倍余量）
        const fanCapacity = designKW * 1.2;

        return {
            evapTemp: evapTemp,
            condTemp: condTemp,
            cop: copValue,
            compressorPower: compressorPower,
            suggestedCapacity: designKW,
            fanCapacity: fanCapacity
        };
    }
};