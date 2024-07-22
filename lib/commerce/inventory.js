const { async } = require('regenerator-runtime');
const constants = require('./constants');
const got = require('got')
const {
    convertSearchCriteriaToString
} = require('../../actions/oauth1a')
const {
    fromCamelCase
} = require('../../actions/utils')

function inventorySync(oauth, logger) {
    const instance = {}

    instance.insertProductInventory = async function (rows) {
        let i = 0;
        const valuesLabels = [];
        const data = {}
        try {
            for (const key in rows) {
                if (rows.hasOwnProperty(key)) {
                    let row = rows[key];
                    i++;
                    row = _formattedRowFieldKeys(row, 'Web_Export_ProductInventory_');
                    row = _populateRequiredFields(row);

                    // get the ac_product_id, ac_configurable_product_id, ac_grouped_product_id, and ac_bundled_product_id
                    let syncNotes = "Load from ERP API. To be created/updated.";

                    const valuesLabel = {
                        'sku': row['sku'],
                        'store_code': 'default',
                        'source_code': row['source_code'],
                        'qty': row['qty'],
                        'create_at': new Date().toISOString().slice(0, 19).replace('T', ' '),
                        'sync_status': 'N',
                        'sync_dt': new Date().toISOString().slice(0, 19).replace('T', ' '),
                        'sync_notes': syncNotes
                    };
                    logger.info(JSON.stringify(valuesLabel));
                    valuesLabels.push(valuesLabel);
                }

            }
            logger.info('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~');

            // logger.info(JSON.stringify(valuesLabels));
            data.aioProductInventories = valuesLabels;
            const resourceUrl = constants.AIOPRODUCTINVENTORY_URI
            //
            logger.info(resourceUrl);
            const productInventoryProcess = await oauth.post(resourceUrl, data)
            //  logger.info('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~'+ JSON.stringify(productProcess));
            return productInventoryProcess;
        } catch (e) {
            logger.info('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~' + e.message);
        }
    }

    instance.getProductInventories = async function (pageSize = 20, currentPage = 1, syncStatuses = ['N']) {
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
        const productInventories = await oauth.get(constants.AIOPRODUCTINVENTORY_URI + "?" + searchCriteriaString);
        return productInventories;
    }


    instance.updateProductInventoryToAc = async function (productInventories) {
        const valuesLabels = [];
        const sourceItems = [];
        const data = {};
        const sourceItemData = {};
        let syncStatus = 'O';
        let syncNotes = 'Product source item has been updated.';
        for (const productInventory of productInventories) {
            // logger.info(typeof (productInventory.qty));
            let qtyInt = parseInt(productInventory.qty, 10);
            let stockStatus = qtyInt > 0 ? 1 : 0;
            const sku = productInventory.sku;
            let sourceCode = productInventory.source_code;
            const param =
            {
                "source_code": sourceCode.toLowerCase(),
                "sku": sku,
                "quantity": qtyInt,
                "status": stockStatus
            }
            // logger.info('----------------' + JSON.stringify(param));
            sourceItems.push(param);

            //Update aio_ac_erp_product_inventory with the status of each record
            const valuesLabel = productInventory;
            valuesLabel.sync_status = syncStatus;
            valuesLabel.sync_dt = new Date().toISOString().slice(0, 19).replace('T', ' ');
            valuesLabel.sync_notes = syncNotes;
            valuesLabels.push(valuesLabel);
        }

        // logger.info(JSON.stringify(sourceItems))
        try {
            sourceItemData.sourceItems = sourceItems;
            const inventoryResourceUrl = constants.PRODUCT_INVENTORY_SOURCE_ITEM;
            const productInventoryProcess = await oauth.post(inventoryResourceUrl, sourceItemData);
        } catch (error) {
            logger.info('###################' + error?.message);
            let syncResult = _handleError(error, syncStatus, syncNotes);
            valuesLabels.map(item => {
                item.sync_status = syncResult["sync_status"];
                item.sync_notes = syncResult["sync_notes"];
                return item;
            });
        }
        // logger.info(JSON.stringify(valuesLabels))
        data.aioProductInventories = valuesLabels;
        const aioInventoryResourceUrl = constants.AIOPRODUCTINVENTORY_URI
        logger.info('aip erp product inventory update ' + aioInventoryResourceUrl);
        const productInventoryProcess = await oauth.post(aioInventoryResourceUrl, data);
    }

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
            } else {
                syncStatus = 'F';
            }
        } else {
            syncStatus = 'F';
            logger.error(error)
            syncNotes = error.errorMessage === undefined ? error : errorMessage;
        }
        return {
            "sync_status": syncStatus,
            "sync_notes": syncNotes
        }
    }

    /**
     * Populates the required fields in a given row object based on a predefined mapping.
     * @param {object} row - The row object to populate the required fields for.
     * @returns {object} - The new row object with the required fields populated.
     */
    _populateRequiredFields = (row) => {
        const mapping = constants.INVENTORY_REQUIRED_ATTRIBUTE_MAPPINGS;
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
                new_row[updated_field_name] = row[field_name];
            }
        }
        return new_row;
    }

    return instance
}

module.exports = {
    inventorySync
}
