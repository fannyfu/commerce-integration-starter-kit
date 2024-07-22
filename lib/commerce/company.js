const { async } = require('regenerator-runtime');
const constants = require('./constants');
const got = require('got')
const {
    convertSearchCriteriaToString
} = require('../../actions/oauth1a')
const {
    fromCamelCase
} = require('../../actions/utils')

function companySync(oauth, logger) {
    const instance = {}

    instance.insertCompany = async function (rows) {
        let i = 0;
        const valuesLabels = [];
        const data = {}
        try {
            for (const key in rows) {
                if (rows.hasOwnProperty(key)) {
                    let row = rows[key];
                    i++;
                    row = _formattedRowFieldKeys(row, 'Web_Export_Customers_');
                  //  row = _populateRequiredFields(row);


                    let syncNotes = "Load from ERP API. To be created/updated.";

                    const valuesLabel = {
                        'cust_id': row['cust_id'],
                        'personal_account': row['personal_account'],
                        'web_admin_contact_id': row['web_admin_contact_id'],
                        'primary_billing_contact_id': row['primary_billing_contact_id'],
                        'bill_to_same_as_main_address': row['bill_to_same_as_main_address'],
                        'website_code': row['website'],
                        'customer_type_code': row['customer_type_code'],
                        'create_at': new Date().toISOString().slice(0, 19).replace('T', ' '),
                        'raw_data': JSON.stringify(row),
                        'sync_dt': new Date().toISOString().slice(0, 19).replace('T', ' '),
                        'sync_status': 'N',
                        'sync_notes': syncNotes
                    };
                    logger.info(JSON.stringify(valuesLabel));
                    valuesLabels.push(valuesLabel);
                }

            }
            logger.info('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~');

            // logger.info(JSON.stringify(valuesLabels));
            data.AioAcErpCompanys = valuesLabels;
            const resourceUrl = constants.AIOACERPCOMPANY_URI
            //
            logger.info(resourceUrl);
            const companyProcess = await oauth.post(resourceUrl, data)
            //  logger.info('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~'+ JSON.stringify(productProcess));
            return companyProcess;
        } catch (e) {
            logger.info('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~' + e.message);
        }
    }

    instance.getCompanies = async function (pageSize = 20, currentPage = 1, syncStatuses = ['N']) {
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
        const companies = await oauth.get(constants.AIOACERPCOMPANY_URI + "?" + searchCriteriaString);
        return companies;
    }


    _handleError = function (error, syncStatus, syncNotes) {
        if (
            error instanceof got.HTTPError &&
            error.response.statusCode == 400
        ) {
            let errorMessage = error.response.body
            logger.info(JSON.stringify(errorMessage))
            syncNotes = JSON.stringify(errorMessage);
            if (errorMessage.message === 'The company is already attached.') {
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
    companySync
}
