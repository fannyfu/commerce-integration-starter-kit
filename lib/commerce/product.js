const { async } = require('regenerator-runtime');
const got = require('got')
const constants = require('./constants');
const {
    convertSearchCriteriaToString
} = require('../../actions/oauth1a')
const {
    fromCamelCase
} = require('../../actions/utils')

function productSync(oauth, logger) {
    const instance = {}

    /**
     * Inserts attribute mappings into the database based on the provided first row of data.
     * @param {Object} firstRow - The first row of data containing attribute mappings.
     * @returns {Promise} A promise that resolves with the result of the attribute insertion process.
     */
    instance.insertAttributeMappings = async function (firstRow, attributeMappings) {
        logger.info("insertAttributeMappings: " + "Starting")
        const rowKeys = Object.keys(firstRow);

        //formatted source key.
        let source_keys = [];
        rowKeys.forEach(function (field) {
            field = field.trim();
            if (!field) {
                return;
            } else {
                source_keys.push(field);
            }
        });
        logger.info('*********************');
        logger.info(source_keys.join(','));
        let exist_source_keys = [];
        if (attributeMappings?.items.length > 0) {
            attributeMappings.items.forEach(function (item) {
                exist_source_keys.push(item.source_key);
            });
        }

        //sour out the source keys that need to insert
        const insertDiff = source_keys.filter(key => !exist_source_keys.includes(key));
        logger.info('11111111111111111111111' + insertDiff.length);

        if (insertDiff.length === 0) {
            logger.info("insertAttributeMappings: " + "no attribute mapping needs to be inserted");
            return;
        }
        let acAttributes = {}
        // get magento attribute with the same source keys.
        let attributeSearchCriteria = {
            "filterGroups": [
                {
                    "filters": [
                        {
                            "field": "attribute_code",
                            "value": insertDiff.join(','),
                            "condition_type": "in"
                        }
                    ]
                }
            ]
        };
        let attributeSearchCriteriaString = convertSearchCriteriaToString(attributeSearchCriteria, "searchCriteria");
        let attributeContent = await oauth.get(constants.PRODUCTATTRIBUTE_URI + "?" + attributeSearchCriteriaString);

        if (attributeContent?.items.length > 0) {
            attributeContent.items.forEach(attributeItem => {
                logger.info('attribute code ' + attributeItem.attribute_code);
                acAttributes[attributeItem.attribute_code] = attributeItem;
            });
        }

        const columns = [
            'source_key',
            'attribute_code',
            'attribute_set_name',
            'source_system',
            'attribute_group_name',
            'attribute_label',
            'backend_type',
            'frontend_input',
            'use_in_search',
            'filterable',
            'filterable_in_search',
            'visible_on_product_view',
            'create_at',
            'sync_dt',
            'sync_status',
            'sync_notes'
        ];

        let defaultAttributeSet = 'Default';
        let defaultAttributeGroup = 'ERP';

        let insertData = [];
        let data = {};
        insertDiff.forEach(function (source_key) {
            let backend_type = 'varchar';
            let frontend_input = 'text';
            let use_in_search = 0;
            let filterable = 0;
            let filterable_in_search = 0;
            let visible_on_product_view = 0;

            const create_at = new Date().toISOString();
            const sync_dt = create_at;
            let sync_status = 'N';
            let sync_notes = 'Load from file';

            if (acAttributes.hasOwnProperty(source_key)) {
                backend_type = acAttributes[source_key].backend_type;
                frontend_input = acAttributes[source_key].frontend_input;
                use_in_search = acAttributes[source_key].is_searchable;
                filterable = acAttributes[source_key].is_filterable;
                filterable = filterable ? 1 : 0;
                filterable_in_search = acAttributes[source_key].is_filterable_in_search;
                filterable_in_search = filterable_in_search ? 1 : 0;
                visible_on_product_view = acAttributes[source_key].is_visible_on_front;
                sync_status = 'O';
                sync_notes = 'Attribute is found';
            }

            let tmp = [
                source_key,
                source_key,
                defaultAttributeSet,
                'erp',
                defaultAttributeGroup,
                source_key,
                backend_type,
                frontend_input,
                use_in_search,
                filterable,
                filterable_in_search,
                visible_on_product_view,
                create_at,
                sync_dt,
                sync_status,
                sync_notes
            ];

            const resultObject = columns.reduce((result, key, index) => {
                result[key] = tmp[index];
                return result;
            }, {});
            insertData.push(resultObject);

        });

        // post attribute mapping info to table aio_product_attribute_mapping
        data.aioProductAttributeMappings = insertData;
        const resourceUrl = constants.AIOPRODUCTATTRIBUTEMAPPING_URI
        const attributeProcess = await oauth.post(resourceUrl, data)
        return attributeProcess;
    }

    /**
     * Retrieves attribute mappings from the server using pagination.
     * @returns {Promise<Object>} - A promise that resolves to an object containing all the attribute mappings.
     * The object has the following properties:
     * - items: An array of attribute mappings.
     * - search_criteria: The search criteria used for the retrieval.
     * - total_count: The total count of attribute mappings.
     */
    instance.retrieveAttributeMappings = async function (syncStatus = ['O']) {
        const pageSize = 100
        let currentPage = 1
        let searchCriteria = {
            "pageSize": pageSize,
            "currentPage": currentPage,
            "filterGroups": [
                {
                    "filters": [
                        {
                            "field": "sync_status",
                            "value": syncStatus.join(","),
                            "condition_type": "in"
                        }
                    ]
                }
            ]
        }
        let searchCriteriaString = convertSearchCriteriaToString(searchCriteria, "searchCriteria")
        let content = await oauth.get(constants.AIOPRODUCTATTRIBUTEMAPPING_URI + "?" + searchCriteriaString)
        let attributes = {}
        if (content.items && content.items.length > 0) {
            content.items.forEach(function (item) {
                const params = item.options.map((option) => {
                    return { [option.label.trim().toLowerCase()]: option.value }
                })
                item.options = params
                attributes[item.attribute_code] = item
            });
        }

        let allItems = {
            "items": content.items,
            "search_criteria": content.search_criteria,
            "total_count": content.total_count
        }
        while (allItems.items.length < allItems.total_count) {
            currentPage += 1
            searchCriteria = {
                "pageSize": pageSize,
                "currentPage": currentPage
            }
            searchCriteriaString = convertSearchCriteriaToString(searchCriteria, "searchCriteria")
            content = await oauth.get(constants.AIOPRODUCTATTRIBUTEMAPPING_URI + "?" + searchCriteriaString)
            if (content.items && content.items.length > 0) {
                content.items.forEach(function (item) {
                    const params = item.options.map((option) => {
                        return { [option.label.trim().toLowerCase()]: option.value }
                    })
                    item.options = params
                    attributes[item.attribute_code] = item
                });
            }
            allItems.items = [...allItems.items, ...content.items]
        }
        allItems["attributes"] = attributes;
        return allItems
    }

    /**
     * Inserts product master data into the database.
     * @param {Array} rows - An array of rows containing product data.
     * @returns {Promise} - A promise that resolves with the result of the insertion process.
     * @throws {Error} - If an error occurs during the insertion process.
     */
    instance.insertProductMaster = async function (rows, attributeMappings, processAttributeMapping = false) {
        logger.info("insertProductMaster: " + "Starting")
        let i = 0;
        const valuesLabels = [];
        const data = {}
        try {
            for (const key in rows) {
                if (rows.hasOwnProperty(key)) {
                    let row = rows[key];
                    i++;
                    row = _formattedRowFieldKeys(row, "Web_Export_Products_");
                    row = _populateRequiredFields(row);
                    if (i === 1 && processAttributeMapping) {
                        await instance.insertAttributeMappings(row, attributeMappings);
                    }
                    // get the ac_product_id, ac_configurable_product_id, ac_grouped_product_id, and ac_bundled_product_id
                    let syncNotes = "Load from ERP API. To be created/updated.";
                    const valuesLabel = {
                        'sku': row['sku'],
                        'store_code': 'admin',
                        'type_id': 'simple',
                        'configurable_sku': row['base_sku'],
                        'grouped_sku': row['group_base_sku_list'],
                        'bundled_sku': row['bundle_base_sku_list'],
                        'create_at': new Date().toISOString().slice(0, 19).replace('T', ' '),
                        'raw_data': JSON.stringify(row),
                        'sync_status': 'N',
                        'sync_dt': new Date().toISOString().slice(0, 19).replace('T', ' '),
                        'sync_notes': syncNotes
                    };
                    //  logger.info(JSON.stringify(valuesLabel));
                    valuesLabels.push(valuesLabel);
                }

            }
            logger.info('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~');

            // logger.info(JSON.stringify(valuesLabels));
            data.aioProductMasters = valuesLabels;
            const resourceUrl = constants.AIOPRODUCTMASTER_URI
            //
            logger.info(resourceUrl);
            const productProcess = await oauth.post(resourceUrl, data)
            //  logger.info('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~'+ JSON.stringify(productProcess));
            return productProcess;
        } catch (e) {
            logger.info('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~' + e.message);
        }
    }

    /**
     * Updates the product master to the AC (Adobe Commerce) system.
     * @param {Array} productMasters - An array of product master objects to update.
     * @returns None
     * @throws {Error} If there is an error during the update process.
     */
    instance.updateProductMasterToAc = async function (productMasters, attributeMapping = {}) {
        logger.info("updateProductMasterToAc: " + "start");
        try {
            logger.info(Object.keys(attributeMapping).join(","));
            const valuesLabels = [];
            const data = {}
            let productParams = [];
            for (const productMaster of productMasters) {
                let { formatted_data, attribute_mapping } = await _reformatData(productMaster, attributeMapping);
                let formattedData = formatted_data;
                attributeMapping = attribute_mapping;
                let missedRequiredFields = [];
                //insert or update product to ac.
                logger.info('Formatted Data' + JSON.stringify(formattedData));
                // logger.info('shipperhq_shipping_group options: ' + JSON.stringify(attributeMapping["shipperhq_shipping_group"].options));
                // logger.info('attribute_mapping key' + JSON.stringify(Object.keys(attributeMapping)));
                let pVisibility = 1; // Not Visible Individually
                let customAttributes = [];
                Object.entries(formattedData).forEach(([index, value]) => {
                    if (!['sku', 'name'].includes(index)) {
                        if (productMaster['ac_product_id'] && ['description'].includes(index) ){
                            return;
                        }
                        let customAttribute = {
                            "attribute_code": index,
                            "value": value
                        };
                        customAttributes.push(customAttribute);
                    }
                });

                //set special price to customAttribute when it's exist
                if (formattedData["closeout_price"] && formattedData["closeout_price"] > 0) {
                    const closeoutPrice = formattedData["closeout_price"];
                    const currentDate = new Date();
                    const startDate = currentDate.toISOString().slice(0, 19).replace('T', ' ');
                    currentDate.setFullYear(currentDate.getFullYear() + 1);

                    customAttributes.push(
                        {
                            "attribute_code": "special_price",
                            "value": closeoutPrice
                        },
                        {
                            "attribute_code": "special_from_date",
                            "value": startDate
                        },
                        {
                            "attribute_code": "special_to_date",
                            "value": currentDate.toISOString().slice(0, 19).replace('T', ' ')
                        }
                    );
                }

                // if (!(productMaster['configurable_sku'] || productMaster['grouped_sku'] || productMaster['bundled_sku]'])) {
                // If the simple product is NOT assigned to a configurable product
                // Update the visibility to Catalog,Search
                // https://redminex.silksoftware.com/issues/110041
                if (!productMaster['configurable_sku']) {
                    //this is a simple product without parent items.
                    pVisibility = 4; // Catalog,Search
                }
                let params = {};
                if (!productMaster['ac_product_id']) {
                    if (!formattedData.hasOwnProperty("sku")) {
                        missedRequiredFields.push("sku");
                    } else if (!formattedData.hasOwnProperty("name")) {
                        missedRequiredFields.push("name");
                    } else {
                        let priceItem = {}
                        if (formattedData["closeout_original_price"] && formattedData["closeout_original_price"] > 0) {
                            priceItem = {
                                sku: formattedData['sku'],
                                price: formattedData["closeout_original_price"]
                            }
                        } else {
                            let productPrices = await _getProductPricesBySkus([formattedData['sku']]);
                            priceItem = productPrices.items.find(item => item.sku === formattedData['sku']);
                        }
                        if (priceItem && priceItem.price) {
                            formattedData["price"] = priceItem.price;
                            params = {
                                "product": {
                                    "sku": formattedData['sku'],
                                    "name": formattedData['name'],
                                    "weight": formattedData['weight'],
                                    "attribute_set_id": 4,
                                    "price": formattedData["price"],
                                    "status": formattedData["status"],
                                    "visibility": pVisibility,
                                    "type_id": "simple",
                                    "custom_attributes": customAttributes
                                }
                            };
                        } else {
                            missedRequiredFields.push("price");
                        }
                    }
                } else {
                    params = {
                        "product": {
                            "sku": formattedData['sku'],
                          //  "name": formattedData['name'],
                            "weight": formattedData['weight'],
                            "status": formattedData["status"],
                            "custom_attributes": customAttributes
                        }
                    };
                }

                let syncStatus = "O"; // Assum sucess
                let syncNotes = 'Processing...';

                productParams.push(
                    {
                        "missedRequiredFields": missedRequiredFields,
                        "productMaster": productMaster,
                        "formattedData": formattedData,
                        "simpleProductParams": params,
                        "syncStatus": syncStatus,
                        "syncNotes": syncNotes
                    }
                )
            }
            // Handling products in parallel to speed up the process.
            const promises = productParams.map(productParam => _handleProduct(productParam));
            const results = await Promise.all(promises);
            // logger.info(results);
            for (let i = 0; i < productMasters.length; i++) {
                valuesLabels.push({
                    ...productMasters[i],
                    ...(results.find((itmInner) => itmInner.id === productMasters[i].id))
                }
                );
            }
            data.aioProductMasters = valuesLabels;
            const resourceUrl = constants.AIOPRODUCTMASTER_URI
            logger.info('aip erp product master update ' + resourceUrl);
            const productProcess = await oauth.post(resourceUrl, data);
        } catch (e) {
            logger.info('updateProductMasterToAc Error: ' + e?.message);
        }
        return attributeMapping;
    }

    /**
     * Retrieves the product masters with the specified search criteria.
     *
     * @param {number} pageSize - The number of product masters to retrieve per page. Defaults to 20.
     * @param {number} currentPage - The current page of product masters to retrieve. Defaults to 1.
     * @param {Array} syncStatuses - The sync statuses to filter the product masters by. Defaults to ['N'].
     * @return {Promise<Array>} A promise that resolves with an array of product masters.
     */
    instance.getProductMasters = async function (pageSize = 20, currentPage = 1, syncStatuses = ['N']) {
        let searchCriteria = {
            "pageSize": pageSize,
            "currentPage": currentPage,
            "filterGroups": [
                {
                    "filters": [
                        {
                            "field": "sync_status",
                            "value": syncStatuses.join(","),
                            "condition_type": "in"
                        }
                    ]
                }
            ]
        };
        const searchCriteriaString = convertSearchCriteriaToString(searchCriteria, "searchCriteria");
        const productMasters = await oauth.get(constants.AIOPRODUCTMASTER_URI + "?" + searchCriteriaString);
        return productMasters;
    }

    /**
     * Handles an error and updates the sync status and notes accordingly.
     *
     * @param {Error} error - The error object to handle.
     * @param {string} syncStatus - The current sync status.
     * @param {string} syncNotes - The current sync notes.
     * @return {Object} - An object containing the updated sync status and notes.
     */
    _handleError = function (error, syncStatus, syncNotes) {
        if (
            error instanceof got.HTTPError &&
            error.response.statusCode == 400
        ) {
            let errorMessage = error.response.body
            logger.info(JSON.stringify(errorMessage))
            syncNotes = JSON.stringify(errorMessage);
            if (errorMessage.message === 'The product is already attached.') {
                syncStatus = 'O';
                syncNotes = errorMessage?.message ?? syncNotes;
            } else {
                syncStatus = 'F';
            }
        } else {
            syncStatus = 'E';
            logger.error(error)
            syncNotes = error.errorMessage === undefined ? error : errorMessage;
        }
        return {
            "sync_status": syncStatus,
            "sync_notes": syncNotes
        }
    }

    /**
     * Handles the product based on the given parameters.
     *
     * @param {Object} productParam - The product parameters.
     * @return {Object} The synchronization status, notes, date, and ID.
     */
    _reformatData = async function (productMaster, attributeMapping) {
        const formattedData = {};
        const rawData = JSON.parse(productMaster.raw_data);
        for (const key in attributeMapping) {
            if (attributeMapping.hasOwnProperty(key)) {
                const attribute = attributeMapping[key];

                let attributeCode = key;
                let sourceKey = attribute["source_key"] ?? attributeCode;
                // If the value from KK is '****' then set as empty.
                if (rawData[sourceKey] === '****') {
                    rawData[sourceKey] = "";
                }
                if (attributeCode === "status") {
                    if (
                        rawData[sourceKey] === true ||
                        rawData[sourceKey] === 1 ||
                        rawData[sourceKey] === "1" ||
                        (typeof (rawData[sourceKey]) == 'string' && rawData[sourceKey].toLowerCase() === "y") ||
                        (typeof (rawData[sourceKey]) == 'string' && rawData[sourceKey].toLowerCase() === "yes")
                    ) {
                        formattedData[attributeCode] = 1;
                    } else {
                        formattedData[attributeCode] = 2;
                    }
                    continue;
                }
                if (['visibility', 'tax_class_id'].includes(key)) {
                    formattedData[attributeCode] = rawData[sourceKey];
                    continue;
                }

                if (attribute.frontend_input === 'select') {
                    let optionValue = rawData[sourceKey];
                    let optionId = 0;
                    if (optionValue) {
                        optionId = await _createOrGetOptionId(attribute.options, attributeCode, optionValue)
                        if (optionId) {
                            formattedData[attributeCode] = optionId;
                            attribute.options.push({
                                [optionValue.trim().toLowerCase()]: optionId
                            })
                        }
                    }
                } else if (attribute.frontend_input === 'multiselect') {
                    const optionIds = [];
                    const optionValues = rawData[sourceKey].split(",");
                    for (const optionValue of optionValues) {
                        if (optionValue) {
                            const optionId = await _createOrGetOptionId(attribute.options, attributeCode, optionValue)
                            if (optionId && !optionIds.includes(optionId)) {
                                optionIds.push(optionId);
                                // attribute.options[optionValue.trim().toLowerCase()] = optionId;
                                attribute.options.push({
                                    [optionValue.trim().toLowerCase()]: optionId
                                })
                            }
                        }
                    }
                    if (optionIds.length > 0) {
                        formattedData[attributeCode] = optionIds.join(",");
                    }
                } else if (attribute.frontend_input === 'boolean') {
                    formattedData[attributeCode] = rawData[sourceKey] === false ? 0 : 1;
                } else {
                    formattedData[attributeCode] = rawData[sourceKey] ?? null;
                }
                attributeMapping[key] = attribute;
                // if (attribute.options) {
                //     logger.info(attributeCode + ' options: ' + JSON.stringify(attributeMapping[key].options));
                // }
            }
        }
        return {
            "formatted_data": formattedData,
            "attribute_mapping": attributeMapping
        };
    }

    _handleProduct = async function (productParam) {
        let { missedRequiredFields, productMaster, formattedData, simpleProductParams, syncStatus, syncNotes } = productParam;
        if (missedRequiredFields.length > 0) {
            syncStatus = 'F';
            syncNotes = "Missing required fields: " + JSON.stringify(missedRequiredFields);
        } else {
            let simpleProduct = undefined;

            // Link Configurable product
            let syncResult = await _linkConfigurableProduct(productMaster, formattedData, simpleProductParams, simpleProduct, syncStatus, syncNotes);
            syncStatus = syncResult["sync_status"];
            syncNotes = syncResult["sync_notes"]

            // Linke Grouped product
            // This is out of scope for phase 1
            // The Grouped products will be handled in Adobe Commerce if they are used
            // syncResult = await _linkGroupedProduct(productMaster, formattedData, simpleProductParams, simpleProduct, syncStatus, syncNotes);
            // syncStatus = syncResult["sync_status"];
            // syncNotes = syncResult["sync_notes"]

            // Linke Bundled product
            syncResult = await _linkBundledProduct(productMaster, formattedData, simpleProductParams, simpleProduct, syncStatus, syncNotes);
            syncStatus = syncResult["sync_status"];
            syncNotes = syncResult["sync_notes"]

            // Product is just a simple product
            if (
                !productMaster['configurable_sku'] &&
                !productMaster['grouped_sku'] &&
                !productMaster['bundled_sku'] &&
                simpleProduct === undefined
            ) {
                // Create or update the simple product
                try {
                    // Create or update the simple product
                    simpleProduct = await oauth.post(constants.PRODUCT_URI, simpleProductParams);
                    syncNotes = 'Simple product create/update successfully';
                } catch (error) {
                    logger.error(error)
                    let errorObj = _handleError(error, syncStatus, syncNotes);
                    syncStatus = errorObj["sync_status"]
                    syncNotes = 'Simple product create/update failed with error: ' + errorObj["sync_notes"];
                }
            }

            // Todo:
            // If the simpleProduct is created/updated and productMaster["closeout_price"] > 0
            // Need to set the product's special_price as productMaster["closeout_price"]
            // https://adobe-commerce.redoc.ly/2.4.6-admin/tag/productsspecial-price#operation/PostV1ProductsSpecialprice
        }
        return {
            "sync_status": syncStatus,
            "sync_notes": syncNotes,
            'sync_dt': new Date().toISOString().slice(0, 19).replace('T', ' '),
            "id": productMaster.id
        }
    }

    /**
     * Link a configurable product to its simple product.
     *
     * @param {Object} productMaster - The product master object.
     * @param {Object} formattedData - The formatted data object.
     * @param {Object} simpleProductParams - The simple product parameters object.
     * @param {Object} simpleProduct - The simple product object.
     * @param {string} syncStatus - The synchronization status.
     * @param {string} syncNotes - The synchronization notes.
     * @return {Object} The synchronization status and notes.
     */
    _linkConfigurableProduct = async function (productMaster, formattedData, simpleProductParams, simpleProduct, syncStatus, syncNotes) {
        if (productMaster['configurable_sku']) {
            if (!productMaster['ac_configurable_product_id']) {
                //configurable product not exist , mark the record as failed.
                logger.info('configurable sku not exist simple sku = ' + productMaster['sku'] + ' configurable sku = ' + productMaster['configurable_sku']);
                syncStatus = 'F';
                syncNotes = 'Base sku has not been setup in AC';
            } else {
                try {
                    simpleProduct = await oauth.post(constants.PRODUCT_URI, simpleProductParams);
                } catch (error) {
                    logger.error(error)
                    let errorObj = _handleError(error, syncStatus, syncNotes);
                    syncStatus = errorObj["sync_status"]
                    syncNotes = 'Simple product create/update failed with error: ' + errorObj["sync_notes"];
                    return {
                        "sync_status": syncStatus,
                        "sync_notes": syncNotes
                    }
                }
                try {
                    //assign current simple  product to parent configurable product
                    const childSku = {
                        "childSku": formattedData['sku']
                    }
                    // logger.info(JSON.stringify(childSku))
                    const assignResourceUrl = 'configurable-products/' + encodeURIComponent(productMaster['configurable_sku']) + '/child'
                    try {
                        await oauth.post(assignResourceUrl, childSku);
                        syncStatus = 'O';
                        syncNotes = "Assigned to configurable product successfully."
                    } catch (error) {
                        // If the error message is the product is already attached. Set the sync_status as O.
                        let errorObj = _handleError(error, syncStatus, syncNotes);
                        syncStatus = errorObj["sync_status"]
                        syncNotes = "Configurable product link: " + errorObj["sync_notes"];
                    }
                } catch (error) {
                    logger.error(error)
                    let errorObj = _handleError(error, syncStatus, syncNotes);
                    syncStatus = errorObj["sync_status"]
                    syncNotes = 'Simple product create/update failed with error: ' + errorObj["sync_notes"];
                }
            }
        }
        return {
            "sync_status": syncStatus,
            "sync_notes": syncNotes
        }
    }

    /**
     * Link a grouped product to a product master.
     *
     * @param {Object} productMaster - The product master object.
     * @param {Object} formattedData - The formatted data object.
     * @param {Object} simpleProductParams - The parameters for the simple product.
     * @param {Object} simpleProduct - The simple product object.
     * @param {string} syncStatus - The sync status.
     * @param {string} syncNotes - The sync notes.
     * @return {Object} An object with the sync status and sync notes.
     */
    _linkGroupedProduct = async function (productMaster, formattedData, simpleProductParams, simpleProduct, syncStatus, syncNotes) {
        // 1 simple proudct may be assigned to multiple Grouped products
        // SKU: TR170029, grouped_product_list: GRP_Track1~GRP_Track3~GRP_Track5
        if (productMaster['grouped_sku']) {
            if (!productMaster['ac_grouped_product_id']) {
                //configurable product not exist , mark the record as failed.
                logger.info('Grouped sku not exist ' + productMaster['grouped_sku']);
                syncStatus = 'F';
                syncNotes = 'Grouped sku(s) has not been setup in AC';
            } else {
                try {
                    if (simpleProduct === undefined) {
                        // Create or update the simple product
                        simpleProduct = await oauth.post(constants.PRODUCT_URI, simpleProductParams);
                    }
                } catch (error) {
                    logger.error(error)
                    let errorObj = _handleError(error, syncStatus, syncNotes);
                    syncStatus = errorObj["sync_status"]
                    syncNotes = 'Simple product create/update failed with error: ' + errorObj["sync_notes"];
                }
                // assign current simple  product to grouped product
                // Ref: https://developer.adobe.com/commerce/webapi/rest/tutorials/grouped-product/
            }
        }
        return {
            "sync_status": syncStatus,
            "sync_notes": syncNotes
        }
    }


    /**
     * Link a bundled product to a simple product.
     *
     * @param {Object} productMaster - The product master object.
     * @param {Object} formattedData - The formatted data object.
     * @param {Object} simpleProductParams - The simple product parameters object.
     * @param {Object} simpleProduct - The simple product object.
     * @param {string} syncStatus - The synchronization status.
     * @param {string} syncNotes - The synchronization notes.
     * @return {Object} An object with the synchronization status and notes.
     */
    _linkBundledProduct = async function (productMaster, formattedData, simpleProductParams, simpleProduct, syncStatus, syncNotes) {
        // 1 simple proudct may be assigned to multiple Bundled products
        if (productMaster['bundled_sku']) {
            if (simpleProduct === undefined) {
                try {
                    simpleProduct = await oauth.post(constants.PRODUCT_URI, simpleProductParams);
                } catch (error) {
                    logger.error(error)
                    let errorObj = _handleError(error, syncStatus, syncNotes);
                    syncStatus = errorObj["sync_status"]
                    syncNotes = 'Simple product create/update failed with error: ' + errorObj["sync_notes"];
                    return {
                        "sync_status": syncStatus,
                        "sync_notes": syncNotes
                    }
                }
            }
            const simpleSku = productMaster['sku'];
            const result = await Promise.all(productMaster['bundled_sku'].split('~').map(async (item) => {
                const [bundleSku, qtyStr] = item.split('_');
                const qty = parseInt(qtyStr);
                // Call {{ _.COMMERCE_BASE_URL }}/rest/default/V1/bundle-products/{sku}/options/all
                // To get all options of the bundled product
                try {
                    let bundleProductOptions = await oauth.get('bundle-products/' + encodeURIComponent(bundleSku) + '/options/all');
                    // Delete all options for the bundled product that has no product link
                    // Iterate through the bundleProductOptions
                    // If there is no product link, delete the option
                    bundleProductOptions.forEach(item => {
                        if (item.product_links && item.product_links.length === 0) {
                            oauth.delete('bundle-products/' + encodeURIComponent(bundleSku) + '/options/' + item.option_id)
                        }
                    })

                    const isSkuFound = bundleProductOptions.some(item => (
                        item.product_links && item.product_links.some(link => link.sku === simpleSku)
                    ));
                    if (!isSkuFound) {
                        const bundleProductOptionParam = {
                            "sku": bundleSku,
                            "title": formattedData['name'],
                            "type": "select",
                            "required": true,
                            "product_links": [
                                {
                                    "sku": simpleSku,
                                    "qty": qty,
                                    "is_default": true,
                                    "price": 0,
                                    "price_type": 0,
                                    "can_change_quantity": 0
                                }
                            ]
                        }
                        if (bundleProductOptions.length > 0) {
                            // There are options for the bundled product.
                            // Add addtional option
                            try {
                                logger.info(JSON.stringify(bundleProductOptionParam));
                                const bundleProductOptionId = await oauth.post('bundle-products/options/add', {"option": bundleProductOptionParam});
                                // syncStatus = 'O';
                                syncNotes += `\nSimple sku ${simpleSku} has been linked with bundled sku ${bundleSku} in AC`;
                            } catch (error) {
                                logger.error(error)
                                let errorObj = _handleError(error, syncStatus, syncNotes);
                                syncStatus = errorObj["sync_status"]
                                syncNotes = `\nSimple sku ${simpleSku} has failed to link with bundled sku ${bundleSku}. Error ${errorObj["sync_notes"]}`;
                            }
                        } else {
                            // There is no option for the bundled product.
                            // Add the first option
                            try {
                                const bundleProductUpdateParam = {
                                    "product": {
                                        "sku": bundleSku,
                                        "extension_attributes": {
                                            "bundle_product_options": [
                                                bundleProductOptionParam
                                            ]
                                        },
                                        "custom_attributes": [
                                            {
                                                "attribute_code": "shipment_type",
                                                "value": "1"
                                            }
                                        ]
                                    },
                                    "saveOptions": true
                                }
                                logger.info(JSON.stringify(bundleProductOptionParam));
                                const bundleProductOptionId = await oauth.post('products', bundleProductUpdateParam);
                                // syncStatus = 'O';
                                syncNotes += `\nSimple sku ${simpleSku} has been linked with bundled sku ${bundleSku} in AC`;
                            } catch (error) {
                                logger.error(error)
                                let errorObj = _handleError(error, syncStatus, syncNotes);
                                syncStatus = errorObj["sync_status"]
                                syncNotes = `\nSimple sku ${simpleSku} has failed to link with bundled sku ${bundleSku}. Error ${errorObj["sync_notes"]}`;
                            }
                        }
                    } else {
                        syncNotes += `\nSimple sku ${simpleSku} has been linked with bundled sku ${bundleSku} in AC`;
                    }
                } catch (error) {
                    // logger.error(error)
                    if (
                        error instanceof got.HTTPError &&
                        error.response.statusCode == 404
                    ) {
                        logger.info('bundled sku not exist ' + bundleSku);
                        syncStatus = 'F';
                        syncNotes += `\nBundled sku ${bundleSku} has not been setup in AC`;
                    } else {
                        let errorObj = _handleError(error, syncStatus, syncNotes);
                        syncStatus = errorObj["sync_status"]
                        syncNotes += '\nFailed to get bundled product options with error: ' + errorObj["sync_notes"];
                    }
                }
            }));
        }
        return {
            "sync_status": syncStatus,
            "sync_notes": syncNotes
        }
    }

    /**
     * Creates a new option or retrieves the existing option ID for the given attribute code and label.
     * @param {Object} options - The options object containing attribute codes and their corresponding options.
     * @param {string} attributeCode - The attribute code for which the option is associated.
     * @param {string} label - The label of the option.
     * @returns {Promise<string>} - The option ID.
     */
    _createOrGetOptionId = async function (options, attributeCode, label) {
        let labelKey = label;
        if (typeof (label) == 'string') {
            labelKey = label.trim().toLowerCase();
            label = label.trim();
        }
        let optionId = '';
        options.forEach(item => {
            if (item[labelKey]) {
                optionId = item[labelKey];
                return optionId;
            }
        });
        if (optionId === '') {
            const data = {
                option: {
                    label: label
                }
            };
            logger.info('new option option option' + JSON.stringify(data));
            const resourceUrl = 'products/attributes/' + attributeCode + '/options'
            try {
                optionId = await oauth.post(resourceUrl, data);
            } catch (error) {
                logger.error(error)
                let errorObj = _handleError(error, "F", "");
                logger.error(`Failed to create option ${label} for attribute ${attributeCode} with error: ${errorObj["sync_notes"]}`);
            }
        }

        return optionId;
    }

    /**
     * Populates the required fields in a given row object based on a predefined mapping.
     * @param {object} row - The row object to populate the required fields for.
     * @returns {object} - The new row object with the required fields populated.
     */
    _populateRequiredFields = (row) => {
        const mapping = constants.PRODUCT_REQUIRED_ATTRIBUTE_MAPPINGS;
        for (const acCode in mapping) {
            let erpCode = mapping[acCode];
            if (row.hasOwnProperty(erpCode)) {
                row[acCode] = row[erpCode];
            }
        }
        return row;
    }

    /**
     * Formats the keys of a row object by converting them from camel case to snake case.
     * @param {object} row - The row object to format.
     * @param {string} prefix - The row object to format.
     * @returns {object} - The formatted row object with snake case keys.
     */
    _formattedRowFieldKeys = (row, prefix) => {
        let new_row = {};
        for (const field_name in row) {
            if (row.hasOwnProperty(field_name)) {
                let updated_field_name = fromCamelCase(field_name, prefix);
                row[field_name] =  row[field_name] === "NA" ? "" :  row[field_name];
                new_row[updated_field_name] = row[field_name];
            }
        }
        return new_row;
    }

    /**
     * Retrieves product prices by SKUs.
     *
     * @param {Array} skus - The SKUs of the products.
     * @param {number} [pageSize=20] - The number of results per page. Default is 20.
     * @param {number} [currentPage=1] - The current page number. Default is 1.
     * @return {Promise<Object>} - The product prices.
     */
    _getProductPricesBySkus = async function (skus, pageSize = 20, currentPage = 1) {
        let searchCriteria = {
            "pageSize": pageSize,
            "currentPage": currentPage,
            "filterGroups": [
                {
                    "filters": [
                        {
                            "field": "main_table.sku",
                            "value": skus.join(","),
                            "condition_type": "in"
                        }
                    ]
                },
                {
                    "filters": [
                        {
                            "field": "website_code",
                            "value": "default",
                            "condition_type": "eq"
                        }
                    ]
                },
                {
                    "filters": [
                        {
                            "field": "customer_group",
                            "value": "default",
                            "condition_type": "eq"
                        }
                    ]
                },
                {
                    "filters": [
                        {
                            "field": "qty",
                            "value": 1,
                            "condition_type": "eq"
                        }
                    ]
                }
            ]
        };
        const searchCriteriaString = convertSearchCriteriaToString(searchCriteria, "searchCriteria");
        const productPrices = await oauth.get(constants.AIOPRODUCTPRICE_URI + "?" + searchCriteriaString);
        return productPrices;
    }

    return instance
}

module.exports = {
    productSync
}
