/**
 * 支持省/市级精度的国际国家配置
 * 
 * ADM0 = 国家级 (country)
 * ADM1 = 省/州级 (province)
 * ADM2 = 市/县级 (city)
 */

export interface CountryPrecisionConfig {
    name: string;        // 国家名称
    adm0: boolean;       // 是否有国家级边界
    adm1: boolean;       // 是否有省级边界
    adm2: boolean;       // 是否有市级边界
}

/**
 * ISO 3166-1 alpha-3 国家代码 -> 精度配置映射
 */
export const SUPPORTED_COUNTRIES: Record<string, CountryPrecisionConfig> = {
    ARG: { name: "阿根廷", adm0: true, adm1: true, adm2: true },
    AUS: { name: "澳大利亚", adm0: true, adm1: true, adm2: false },
    BRA: { name: "巴西", adm0: false, adm1: true, adm2: true },
    CAN: { name: "加拿大", adm0: true, adm1: true, adm2: false },
    CHE: { name: "瑞士", adm0: true, adm1: true, adm2: true },
    DEU: { name: "德国", adm0: true, adm1: true, adm2: true },
    ESP: { name: "西班牙", adm0: true, adm1: true, adm2: true },
    FRA: { name: "法国", adm0: true, adm1: true, adm2: true },
    GBR: { name: "英国", adm0: true, adm1: true, adm2: true },
    IND: { name: "印度", adm0: true, adm1: true, adm2: false },
    ITA: { name: "意大利", adm0: true, adm1: true, adm2: true },
    JPN: { name: "日本", adm0: true, adm1: true, adm2: true },
    KOR: { name: "韩国", adm0: false, adm1: true, adm2: true },
    MEX: { name: "墨西哥", adm0: true, adm1: true, adm2: true },
    NLD: { name: "荷兰", adm0: true, adm1: false, adm2: true },
    RUS: { name: "俄罗斯", adm0: true, adm1: true, adm2: true },
    SGP: { name: "新加坡", adm0: true, adm1: false, adm2: true },
    USA: { name: "美国", adm0: true, adm1: true, adm2: true },
    ZAF: { name: "南非", adm0: true, adm1: true, adm2: false },
};

/**
 * ISO 3166-1 alpha-2 (短代码) 到 alpha-3 (长代码) 的映射
 * Mapbox Geocoding 返回 alpha-2，我们的文件使用 alpha-3
 */
export const ALPHA2_TO_ALPHA3: Record<string, string> = {
    ar: "ARG",
    au: "AUS",
    br: "BRA",
    ca: "CAN",
    ch: "CHE",
    de: "DEU",
    es: "ESP",
    fr: "FRA",
    gb: "GBR",
    in: "IND",
    it: "ITA",
    jp: "JPN",
    kr: "KOR",
    mx: "MEX",
    nl: "NLD",
    ru: "RUS",
    sg: "SGP",
    us: "USA",
    za: "ZAF",
};

/**
 * 获取指定国家支持的最高精度
 */
export function getAvailablePrecision(
    countryCode: string,
    requestedPrecision: 'country' | 'province' | 'city'
): 'ADM0' | 'ADM1' | 'ADM2' | null {
    const config = SUPPORTED_COUNTRIES[countryCode];
    if (!config) return null;

    // 根据请求的精度和可用性进行降级
    if (requestedPrecision === 'city') {
        if (config.adm2) return 'ADM2';
        if (config.adm1) return 'ADM1';
        if (config.adm0) return 'ADM0';
    } else if (requestedPrecision === 'province') {
        if (config.adm1) return 'ADM1';
        if (config.adm0) return 'ADM0';
    } else {
        if (config.adm0) return 'ADM0';
    }

    return null;
}

/**
 * 检查国家是否在支持列表中
 */
export function isCountrySupported(alpha3Code: string): boolean {
    return alpha3Code in SUPPORTED_COUNTRIES;
}

/**
 * 将 alpha-2 代码转换为 alpha-3 代码
 */
export function convertAlpha2ToAlpha3(alpha2: string): string | null {
    return ALPHA2_TO_ALPHA3[alpha2.toLowerCase()] || null;
}
