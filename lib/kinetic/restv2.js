const got = require('got');
const url = require('url');
const https = require('https');
const fetch = require('node-fetch')
const constants = require("../../lib/kinetic/constants")

function getKineticRestClient(options, logger) {
    const instance = {}

    const serverUrl = options.url
    const kineticCompany = options.kineticCompany

    /**
     * Generates the authentication header object for making API requests.
     * @param {object} options - The options object containing the necessary authentication details.
     * @param {string} options.xApiKey - The API key to be included in the header.
     * @param {string} options.license - The license key to be included in the header.
     * @param {string} options.username - The username for basic authentication.
     * @param {string} options.password - The password for basic authentication.
     * @returns {object} The authentication header object.
     */
    const authHeader = {
        "x-api-key": options.xApiKey,
        "License": options.license,
        "Authorization": "Basic " + Buffer.from(options.username + ":" + options.password).toString("base64"),
    }

    let httpsOption = {}

    /**
     * Checks if both client certificate and client key options are provided. If so, creates an HTTPS options object with the provided certificate and key, and sets `rejectUnauthorized` to false.
     * @param {object} options - The options object containing client certificate and client key.
     * @returns {object} - The HTTPS options object with the provided certificate, key, and `rejectUnauthorized` set to false.
     */
    if (options?.clientCert && options?.clientKey) {
        // httpsOption = {
        //     certificate: Buffer.from(options.clientCert, "base64").toString("utf-8"),
        //     key: Buffer.from(options.clientKey, "base64").toString("utf-8"),
        //     // For self-signed certificate
        //     rejectUnauthorized: false,
        // }
        // logger.info('cliencert = ' + options.clientCert)
        // logger.info('client key = ' + options.clientKey)
         httpsOption = new https.Agent({
            cert: Buffer.from(options.clientCert, "base64").toString("utf-8"),
            key: Buffer.from(options.clientKey, "base64").toString("utf-8"),
            rejectUnauthorized: false
        });
    }

    /**
     * Creates a URL by concatenating the server URL, kinetic company, and the resource URL.
     * @param {string} resourceUrl - The resource URL to append to the server URL and kinetic company.
     * @returns {string} The complete URL.
     */
    function createUrl(resourceUrl) {
        return serverUrl + kineticCompany + '/' + resourceUrl
    }

    /**
     * Creates an OData pagination URL with the specified parameters.
     * @param {string} resourceUrl - The base URL of the OData resource.
     * @param {number} [skip=0] - The number of items to skip.
     * @param {number} [top=100] - The maximum number of items to retrieve.
     * @param {boolean} [count=true] - Whether to include the total count of items in the response.
     * @returns {string} The full URL with the specified pagination parameters.
     */
    function createODataQueryUrl(resourceUrl, skip = 0, top = 100, count = true, filters = "", orderby = "") {
        // Define the base URL
        const baseUrl = createUrl(resourceUrl);

        // Define the query parameters as an object
        let queryParams = {
            "$skip": skip,
            "$top": top,
            "$count": count,
        };
        
        if (filters) {
            queryParams["$filter"] = filters;
        }

        if (orderby) {
            queryParams["$orderby"] = orderby;
        }

        // Create the URL with query parameters
        const fullUrl = url.format({ pathname: baseUrl, query: queryParams });
        logger.info('createODataQueryUrl: ' + fullUrl);
        return fullUrl;
    }

    /**
     * Makes an API call using the provided request data and custom headers.
     * @param {object} requestData - The request data object containing the URL and method.
     * @param {object} [customHeaders={}] - Custom headers to be included in the request.
     * @returns {Promise<object>} - A promise that resolves to the API response.
     * @throws {Error} - If an error occurs during the API call.
     */
    async function apiCall(requestData, customHeaders = {}) {
        try {
            logger.info('Fetching URL: ' + requestData.url + ' with method: ' + requestData.method)
            const headers = { ...authHeader, ...customHeaders }
             logger.info(JSON.stringify(requestData.body))
             logger.info(JSON.stringify(headers))
            // const result = await got.got(requestData.url, {
            //     method: requestData.method,
            //     headers: headers,
            //     json: requestData.body,
            //     responseType: 'json',
            //     https: httpsOption
            // }).json()
            // logger.info(result)
            // return result
            const response = await fetch(requestData.url, {
                method: requestData.method,
                headers: {
                    ...headers,
                    'Content-Type': 'application/json' // 确保设置 Content-Type 头
                },
                body: JSON.stringify(requestData.body), // 转换 body 为 JSON 字符串
                agent: httpsOption // 仅在 Node.js 环境中使用 node-fetch 支持
            });

            // 检查响应状态
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json(); // 解析 JSON 响应
            logger.info(result);
            return result;
        } catch (error) {
            logger.error(`Error fetching URL ${requestData.url}: ${error}`)
            throw error
        }
    }

    /**
     * Retrieves a list of staging products from the server.
     * @param {number} [skip=0] - The number of products to skip.
     * @param {number} [top=100] - The maximum number of products to retrieve.
     * @param {boolean} [count=true] - Indicates whether to include the total count of products in the response.
     * @returns {Promise} A promise that resolves to the list of staging products.
     */
    instance.getStagingProducts = async function (skip = 0, top = 100, count = true, filter = "") {
        const resourceUrl = constants.PRODUCT_STAGING_BAQ_URI
        const requestData = {
            url: createODataQueryUrl(
                resourceUrl, 
                skip, 
                top, 
                count, 
                filter, 
                "Web_Export_Products_RecordID asc"
            ),
            method: 'GET'
        }
        let result = apiCall(requestData)
        return result
    }

    instance.getStagingProductPrice = async function(skip = 0, top = 100, count = true, filter = ""){
        const resourceUrl = constants.PRODUCT_PRICE_STAGING_BAQ_URI
        const requestData = {
            url: createODataQueryUrl(
                resourceUrl, 
                skip, 
                top, 
                count, 
                filter, // "Web_Export_ListPrice_PartNumber eq 'ALLE0003'", 
                "Web_Export_ListPrice_RecordID asc"
            ),
            method: 'GET'
        }
        let result = apiCall(requestData)
        return result
    }

    instance.getStagingProductTierPrice = async function(skip = 0, top = 100, count = true, filter = ""){
        const resourceUrl = constants.PRODUCT_TIRE_PRICE_STAGING_BAQ_URI
        const requestData = {
            url: createODataQueryUrl(
                resourceUrl, 
                skip, 
                top, 
                count, 
                filter, // "Web_Export_ListPriceQtyBreaks_PartNumber eq 'ALLE0003'", 
                "Web_Export_ListPriceQtyBreaks_RecordID asc"
            ),
            method: 'GET'
        }
        let result = apiCall(requestData)
        return result
    }

    instance.getStagingProductInventory = async function(skip = 0, top = 100, count = true, filter = ""){
        const resourceUrl = constants.PRODUCT_INVENTORY_STAGING_BAQ_URI
        const requestData = {
            url: createODataQueryUrl(
                resourceUrl, 
                skip, 
                top, 
                count, 
                filter, 
                "Web_Export_ProductInventory_RecordID"
            ),
            method: 'GET'
        }
        let result = apiCall(requestData)
        return result
    }

    instance.getStagingCompany = async function(skip = 0, top = 100, count = true, filter = ""){
        const resourceUrl = constants.COMPANY_STAGING_BAQ_URI
        const requestData = {
            url: createODataQueryUrl(
                resourceUrl,
                skip,
                top,
                count,
                filter,
                "Web_Export_Customers_RecordID"
            ),
            method: 'GET'
        }
        let result = apiCall(requestData)
        return result
    }

    instance.getStagingContact = async function(skip = 0, top = 100, count = true, filter = ""){
        const resourceUrl = constants.CONTACT_STAGING_BAQ_URI
        const requestData = {
            url: createODataQueryUrl(
                resourceUrl,
                skip,
                top,
                count,
                filter,
                "Web_Export_Contacts_RecordID"
            ),
            method: 'GET'
        }
        let result = apiCall(requestData)
        return result
    }

    instance.setStagingTableProcessed = async function(tableName){
        const resourceUrl = constants.STAGING_TABLE_UPD_FUNC_URI
        const requestData = {
            url: createUrl(resourceUrl),
            method: 'POST',
            body: {
                "tableName": tableName
            }
        }
        let result = apiCall(requestData)
        return result
    }

    return instance;
}

module.exports = {
    getKineticRestClient
}
'{"record_id":187898,"staging_time_stamp":"2024-05-16T23:17:00.147-04:00","part_number":"RGBS0005","description":"XLR Cable 4 Pin 20 Ft test update","sales_uom":"Each","web_active":false,"discontinued":false,"base_sku":"","variant_attribute_nominal_color":"","variant_attribute_size":"","bundle_base_sku_list":"","sellable_site_list":"RBW","drop_ship_part":false,"web_lead_days":0,"infinite_inventory":false,"closeout_price":0,"closeout_original_price":0,"promo_min_qty":0,"promo_percent_off":0,"promo_start_date":null,"promo_end_date":null,"net_weight":16.8,"net_weight_uom":"Ounce","gross_weight":1.05,"gross_weight_uom":"Pound","net_volume":0,"net_volume_uom":"","part_length":0,"part_width":0,"part_height":0,"part_length_width_height_um":"","thickness":0,"thickness_um":"","diameter_inside":0,"diameter_outside":0,"diameter_um":"","roll_length":0,"roll_length_uom":"NA","shipping_group":"Dimensional","packing_rule":"Dimensional_Pk","is_malleable":false,"malleable_max_qty":0,"ship_length":0,"ship_width":0,"ship_height":0,"malleable_length":0,"malleable_width":0,"malleable_height":0,"length_width_height_um":"Inch","freight_class":"200","drop_ship_origin_code":"","country_of_origin":"Belgium","hs_commodity_code":"8544.49.2000","commercial_brand":"","generic_color":"","product_type":"","component_type":"","material_composition":"","construction":"","nominal_weight":"","gsm_weight":0,"printable":false,"finish":"","opacity":"","sheen":"","hex_color_code":"","pantone_number":"","gain_front_projection":0,"gain_rear_projection":0,"acoustic_nrc":0,"acoustic_saa":0,"coverage":"","horse_power":"","voltage":"","wattage":"","speed":"","capacity":"","load_rated":false,"features1_label":"","features1":"","features2_label":"","features2":"","type":"Not Applicable","fiber_content":"","ca_registration_number":"","fr_test_nfpa701":false,"fr_test_ca_title19":false,"fr_test_cans109":false,"fr_test_astme84":false,"fr_test_en13773":false,"fr_test_german_b1":false,"fr_test_french_m1":false,"fr_test_en13501":false,"fr_test_british5867":false,"fr_test_imo":false,"fr_test_bfd":false,"fr_test_nfpa253":false,"fr_test_astmd2859":false,"exported_to_web":false,"export_time_stamp":null,"row_ident":"00000005-0000-0000-0000-000000000000","sku":"RGBS0005","name":"XLR Cable 4 Pin 20 Ft test update","kinetic_description":"XLR Cable 4 Pin 20 Ft test update","weight":1.05,"status":false}'