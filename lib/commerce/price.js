const got = require('got')
const constants = require('./constants');
const {
    convertSearchCriteriaToString
} = require('../../actions/oauth1a')
const {
    fromCamelCase
} = require('../../actions/utils')

function priceSync(oauth, logger) {
    const instance = {}

    instance.insertProductPrice = async function (rows, priceType) {
        let i = 0;
        const valuesLabels = [];
        const data = {}
        try {
            for (const key in rows) {
                if (rows.hasOwnProperty(key)) {
                    let row = rows[key];
                    i++;
                    row = _formattedRowFieldKeys(row, priceType);
                    row = _populateRequiredFields(row, priceType);
                    // logger.info(JSON.stringify(row));
                    let syncNotes = "Load from ERP API. To be created/updated.";
                    let qty = 1;
                    if (row['quantity'] !== undefined) {
                        qty = row['quantity'];
                    }
                    let priceValueType = 'fixed';
                    if (row["deletion_flag"] !== undefined && row["deletion_flag"]) {
                        priceValueType = "deleted";
                    }
                    const valuesLabel = {
                        'sku': row['sku'],
                        'website_code': 'default',
                        'customer_group': 'default',
                        'qty': qty,
                        'price': row['price'],
                        'price_value_type': priceValueType,
                        'create_at': new Date().toISOString().slice(0, 19).replace('T', ' '),
                        'sync_status': 'N',
                        'sync_dt': new Date().toISOString().slice(0, 19).replace('T', ' '),
                        'sync_notes': syncNotes
                    };
                    // logger.info(JSON.stringify(valuesLabel));
                    valuesLabels.push(valuesLabel);
                }
            }
            // logger.info(JSON.stringify(valuesLabels));
            data.aioProductPrices = valuesLabels;
            const resourceUrl = constants.AIOPRODUCTPRICE_URI
            const productPriceProcess = await oauth.post(resourceUrl, data)
            return productPriceProcess;
        } catch (e) {
            logger.info('insertProductPrice error: ' + e.message);
        }
    }

    instance.getProductPrices = async function (pageSize = 20, currentPage = 1, syncStatuses = ['N'], needSkuExist = "1") {
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
        const productPrices = await oauth.get(constants.AIOPRODUCTPRICE_URI + "?needSkuExist=" + needSkuExist + "&" + searchCriteriaString);
        return productPrices;
    }


    instance.updateProductPriceToAc = async function (productPrices) {
        const valuesLabels = [];
        const data = {};
        const basePricesParams = {};
        const tierPricesParams = {}
        const deletedTierPricesParams = {}
        for (const productPrice of productPrices) {
            if (parseInt(productPrice.qty, 10) === 1) {
                const param = {
                    "price": productPrice.price,
                    "store_id": 0, // Hardcoded as 0 for now
                    "sku": productPrice.sku,
                    "extension_attributes": {}
                }
                basePricesParams[productPrice["id"]] = param
            } else {
                if (productPrice.price_value_type == "deleted") {
                    const param ={
                        "price": productPrice.price,
                        "price_type": "fixed",
                        "website_id": 0, // Hardcode for now.
                        "sku": productPrice.sku,
                        "customer_group": "General", // Hardcode for now.
                        "quantity": productPrice.qty
                    }
                    deletedTierPricesParams[productPrice["id"]] = param
                } else {
                    const param ={
                        "price": productPrice.price,
                        "price_type": productPrice.price_value_type,
                        "website_id": 0, // Hardcode for now.
                        "sku": productPrice.sku,
                        "customer_group": "General", // Hardcode for now.
                        "quantity": productPrice.qty
                    }
                    tierPricesParams[productPrice["id"]] = param
                }
            }
        }
        // Base prices update
        const basePricesProcessResult = await _updateBasePrices(basePricesParams);
        for (let recordId in basePricesParams) {
            valuesLabels.push({
                ...(productPrices.find((itmInner) => Number(itmInner.id) === Number(recordId))),
                ...(basePricesProcessResult.find((itmInner) => Number(itmInner.id) === Number(recordId)))
            });
        }

        // Tier prices update
        const tierPricesProcessResult = await _updateTierPrices(tierPricesParams);
        // logger.info(JSON.stringify(tierPricesProcessResult));
        for (let recordId in tierPricesParams) {
            valuesLabels.push({
                ...(productPrices.find((itmInner) => Number(itmInner.id) === Number(recordId))),
                ...(tierPricesProcessResult.find((itmInner) => Number(itmInner.id) === Number(recordId)))
            });
        }

        // Tier prices delete
        const tierPricesDeleteProcessResult = await _updateTierPrices(deletedTierPricesParams, true);
        // logger.info(JSON.stringify(tierPricesDeleteProcessResult));
        for (let recordId in deletedTierPricesParams) {
            valuesLabels.push({
                ...(productPrices.find((itmInner) => Number(itmInner.id) === Number(recordId))),
                ...(tierPricesDeleteProcessResult.find((itmInner) => Number(itmInner.id) === Number(recordId)))
            });
        }
        // logger.info(JSON.stringify(valuesLabels));
        data.aioProductPrices = valuesLabels;
        const aioPriceResourceUrl = constants.AIOPRODUCTPRICE_URI
        const productPriceProcess = await oauth.post(aioPriceResourceUrl, data);

    }

    _updateBasePrices = async function (basePricesParams) {
        const basePricesResourceUrl = constants.PRODUCT_BASE_PRICE
        const basePricesProcessResult = []
        try {
            logger.info(JSON.stringify(Object.values(basePricesParams)));
            const apiResult = await oauth.post(basePricesResourceUrl, {"prices": Object.values(basePricesParams)});
            logger.info(JSON.stringify(apiResult));
            for (let recordId in basePricesParams) {
                let errorRecord = _findMatchingBasePriceErrorRecord(apiResult, basePricesParams[recordId]);
                basePricesProcessResult.push({
                    "sync_status": errorRecord ? 'F' : "O",
                    "sync_notes": errorRecord ? JSON.stringify(errorRecord) : "Price is updated successfully.",
                    'sync_dt': new Date().toISOString().slice(0, 19).replace('T', ' '),
                    "id": recordId
                })
            }
        } catch (error) {
            let syncStatus = 'F';
            let syncNotes = "Error while updating the price."
            if (
                error instanceof got.HTTPError &&
                error.response.statusCode == 400
            ) {
                let errorMessage = error.response.body
                logger.info(JSON.stringify(errorMessage))
                syncNotes = JSON.stringify(errorMessage);
                syncStatus = 'F';
            } else {
                syncStatus = 'E';
                logger.error(error)
                syncNotes = error.errorMessage === undefined ? error : errorMessage;
            }
            for (let recordId in basePricesParams) {
                basePricesProcessResult.push({
                    "sync_status": syncStatus,
                    "sync_notes": syncNotes,
                    'sync_dt': new Date().toISOString().slice(0, 19).replace('T', ' '),
                    "id": recordId
                })
            }
        }
        return basePricesProcessResult;
    }

    _findMatchingBasePriceErrorRecord = function (dataList, inputData) {
        for (const record of dataList) {
            const [fieldName, fieldValue] = record.parameters;

            if (record.message.startsWith("Invalid attribute %fieldName = %fieldValue.") &&
                fieldName === "SKU" && fieldValue === inputData.sku) {
                return record;
            }

            if (record.message.startsWith("Requested store is not found.") &&
                fieldName === inputData.sku && fieldValue.toString() === inputData.store_id.toString()) {
                return record;
            }

            if (record.message.startsWith("Invalid attribute %fieldName = %fieldValue.") &&
                fieldName === "Price" && parseFloat(fieldValue) === parseFloat(inputData.price)) {
                return record;
            }
        }
        return null; // No matching record found
    }

    _updateTierPrices = async function (tierPricesParams, isDelete = false) {
        const tierPricesResourceUrl = isDelete ? constants.PRODUCT_TIER_PRICE_DELETE : constants.PRODUCT_TIER_PRICE;
        const tierPricesProcessResult = [];
        try {
            logger.info(JSON.stringify(Object.values(tierPricesParams)));
            const apiResult = await oauth.post(tierPricesResourceUrl, {"prices": Object.values(tierPricesParams)});
            logger.info(JSON.stringify(apiResult));
            for (let recordId in tierPricesParams) {
                let errorRecord = _findMatchingTierPriceErrorRecord(apiResult, tierPricesParams[recordId]);
                tierPricesProcessResult.push({
                    "sync_status": errorRecord ? 'F' : "O",
                    "sync_notes": errorRecord ? JSON.stringify(errorRecord) : "Price is updated successfully.",
                    'sync_dt': new Date().toISOString().slice(0, 19).replace('T', ' '),
                    "id": recordId
                })
            }
        } catch (error) {
            let syncStatus = 'F';
            let syncNotes = "Error while updating the price."
            if (
                error instanceof got.HTTPError &&
                error.response.statusCode == 400
            ) {
                let errorMessage = error.response.body
                logger.info(JSON.stringify(errorMessage))
                syncNotes = JSON.stringify(errorMessage);
                syncStatus = 'F';
            } else {
                syncStatus = 'E';
                logger.error(error)
                syncNotes = error.errorMessage === undefined ? error : errorMessage;
            }
            for (let recordId in tierPricesParams) {
                tierPricesProcessResult.push({
                    "sync_status": syncStatus,
                    "sync_notes": syncNotes,
                    'sync_dt': new Date().toISOString().slice(0, 19).replace('T', ' '),
                    "id": recordId
                })
            }
        }
        return tierPricesProcessResult;
    }

    _findMatchingTierPriceErrorRecord = function (dataList, inputData) {
        for (const record of dataList) {
            const [param1, param2, param3, param4] = record.parameters;

            if (record.message.startsWith("Invalid attribute SKU = %SKU") &&
                param1 === inputData.sku) {
                return record;
            }

            if (record.message.startsWith("Invalid attribute Price = %price.") &&
                param2 === inputData.sku && parseFloat(param1) === parseFloat(inputData.price)) {
                return record;
            }

            if (record.message.startsWith("Invalid attribute Quantity = %qty.") &&
                param1 === inputData.sku && parseFloat(param4) === parseFloat(inputData.quantity)) {
                return record;
            }

            if (record.message.startsWith("No such entity with Customer Group = %customerGroup.") &&
                param1 === inputData.sku && param3 === inputData.customer_group) {
                return record;
            }
        }
        return null; // No matching record found
    }

    /**
     * Populates the required fields in a given row object based on a predefined mapping.
     * @param {object} row - The row object to populate the required fields for.
     * @param {string} priceType - The row object to format.
     * @returns {object} - The new row object with the required fields populated.
     */
    _populateRequiredFields = (row, priceType) => {
        const mapping = priceType === 'tier_price' ? constants.TIER_PRICE_REQUIRED_ATTRIBUTE_MAPPINGS : constants.LIST_PRICE_REQUIRED_ATTRIBUTE_MAPPINGS;
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
     * @param {string} priceType - The row object to format.
     * @returns {object} - The formatted row object with snake case keys.
     */
    _formattedRowFieldKeys = (row, priceType) => {
        let prefix = priceType === 'tier_price' ? "Web_Export_ListPriceQtyBreaks" : "Web_Export_ListPrice";
        let new_row = {};
        for (const field_name in row) {
            if (row.hasOwnProperty(field_name)) {
                let updated_field_name = fromCamelCase(field_name, prefix);
                new_row[updated_field_name] = row[field_name];
            }
        }
        return new_row;
    }

    return instance
}

module.exports = {
    priceSync
}
