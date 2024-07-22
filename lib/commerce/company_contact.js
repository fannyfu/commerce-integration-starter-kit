const { async } = require('regenerator-runtime');
const constants = require('./constants');
const got = require('got')
const {
    convertSearchCriteriaToString
} = require('../../actions/oauth1a')
const {
    fromCamelCase
} = require('../../actions/utils')

function companyContactSync(oauth, logger) {
    const instance = {}

    instance.getContacts = async function (pageSize = 20, currentPage = 1, filters = []) {
        let searchCriteria = {
            "pageSize": pageSize,
            "currentPage": currentPage,
            "filterGroups": [
                {
                    "filters": filters
                }
            ]
        };
        const searchCriteriaString = convertSearchCriteriaToString(searchCriteria, "searchCriteria");
        const contacts = await oauth.get(constants.AIOACERPCONTACT_URI + "?" + searchCriteriaString);
        return contacts;
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
            if (errorMessage.message === 'The item is already attached.') {
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

    instance.updateAdminContactToAc = async function (adminContacts,custAdminContactMapping) {
        const valuesLabels = [];
        const sourceItems = [];
        const data = {};
        const sourceItemData = {};

        for (const adminContact of adminContacts) {
            // logger.info(typeof (productInventory.qty));
            let formatted_data = await _reformatData(adminContact);
            let formattedData = formatted_data;
            let params = {};

            let customAttributes = [];
            Object.entries(formattedData).forEach(([index, value]) => {
                if (!['email', 'lastname','firstname'].includes(index)) {
                    let customAttribute = {
                        "attribute_code": index,
                        "value": value
                    };
                    customAttributes.push(customAttribute);
                }
            });
           params = {
                "customer": {
                    "email": formattedData['email'],
                    "firstname": formattedData['firstname'],
                    "lastname": formattedData["lastname"],
                    "website_id": 1,
                    "group_id": 1,
                    "store_id": 1,
                    "custom_attributes": customAttributes
                }
            };

        }

         logger.info(JSON.stringify(params))
        try {
            const contactResourceUrl = constants.CONTACT_URI;
            const contactProcess = await oauth.post(contactResourceUrl, params);
        } catch (error) {
            logger.info('###################' + error?.message);
            let syncResult = _handleError(error, syncStatus, syncNotes);
            valuesLabels.map(item => {
                item.sync_status = syncResult["sync_status"];
                item.sync_notes = syncResult["sync_notes"];
                return item;
            });
        }

    }

    _reformatData = async function (adminContact) {
        let formattedData = {};
        const rawData = JSON.parse(adminContact.raw_data);
        formattedData = _populateRequiredFields(rawData);
        return formattedData;
    }

    _populateRequiredFields = (row) => {
        const mapping = constants.CONTACT_REQUIRED_ATTRIBUTE_MAPPINGS;
        for (const acCode in mapping) {
            let erpCode = mapping[acCode];
            if (row.hasOwnProperty(erpCode)) {
                row[acCode] = row[erpCode];
            }
        }
        return row;
    }

    return instance
}

module.exports = {
    companyContactSync
}
