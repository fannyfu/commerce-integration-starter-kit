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

        const contactParams = [];
        const valuesLabels = [];
        const data = {}

        for (const adminContact of adminContacts) {
            let formatted_data = await _reformatDataContact(adminContact);
            let formattedData = formatted_data;
            let params = {};
            let missedRequiredFields = [];

            let customAttributes = [];
            Object.entries(formattedData).forEach(([index, value]) => {
                if (!['email', 'lastname','firstname'].includes(index)) {
                    if(value === false){
                        value = 0
                    }
                    if(value === true){
                        value = 1
                    }
                    let customAttribute = {
                        "attribute_code": index,
                        "value": value
                    };
                    customAttributes.push(customAttribute);
                }
            });
            if (adminContact['ac_customer_id']) {
                params = {
                    "customer": {
                        "id" :adminContact['ac_customer_id'],
                        "email": 'test.' + formattedData['email'],
                        "firstname": formattedData['firstname'],
                        "lastname": formattedData["lastname"],
                        "website_id": 1,
                        "group_id": 1,
                        "store_id": 1,
                        "custom_attributes": customAttributes
                    }
                };
            }else{
                params = {
                    "customer": {
                        "email": 'test.' + formattedData['email'],
                        "firstname": formattedData['firstname'],
                        "lastname": formattedData["lastname"],
                        "website_id": 1,
                        "group_id": 1,
                        "store_id": 1,
                        "custom_attributes": customAttributes
                    }
                };
            }

            //logger.info(JSON.stringify(params))
            let syncStatus = "O"; // Assum sucess
            let syncNotes = 'Processing...';
            contactParams.push(
                {
                    "missedRequiredFields": missedRequiredFields,
                    "stgContact": adminContact,
                    "formattedData": formattedData,
                    "contactParams": params,
                    "syncStatus": syncStatus,
                    "syncNotes": syncNotes
                }
            )

        }
        let companySuperUserMappings = {};
        try {
            // Handling admin contacts in parallel to speed up the process.
            const promises = contactParams.map(contactParam => _handleContact(contactParam));
            const results = await Promise.all(promises);
            logger.info('22222222222222222' + JSON.stringify(results))
            for (let i = 0; i < adminContacts.length; i++) {
                let syncResult = results.find((itmInner) => itmInner.id === adminContacts[i].id);

                if (!companySuperUserMappings[syncResult['mapping']['cust_id']]) {
                    companySuperUserMappings[syncResult['mapping']['cust_id']] = {};
                }

                companySuperUserMappings[syncResult['mapping']['cust_id']]['super_user_id'] = syncResult['mapping']['ac_contact_id'];
                companySuperUserMappings[syncResult['mapping']['cust_id']]['company_email'] = syncResult['mapping']['email'];

                delete(syncResult['mapping']);
                valuesLabels.push({
                        ...adminContacts[i],
                        ...syncResult
                    }
                );
            }
            data.AioAcErpContacts = valuesLabels;
            const resourceUrl = constants.AIOACERPCONTACT_URI
            //
           // logger.info(resourceUrl);
            const contactProcess = await oauth.post(resourceUrl, data)

        } catch (error) {
            logger.info('###################' + error?.message);
            let syncResult = _handleError(error, syncStatus, syncNotes);
            valuesLabels.map(item => {
                item.sync_status = syncResult["sync_status"];
                item.sync_notes = syncResult["sync_notes"];
                return item;
            });
        }
        logger.info('3333333333333333' + JSON.stringify(companySuperUserMappings))
        return companySuperUserMappings;

    }
    instance.updateCompanyToAc = async function (stgCompanies,CompanySuperUserMapping) {

        const companyParams = [];
        const valuesLabels = [];
        const data = {}

        for (const stgCompany of stgCompanies) {
            let formatted_data = await _reformatDataCompany(stgCompany,CompanySuperUserMapping);
            let formattedData = formatted_data;
            let params = {};
            let missedRequiredFields = [];

            let kkAttributeParams = {};
            let kkAttributes = [];
            let streetLines = [];
            Object.entries(formattedData).forEach(([index, value]) => {
                if (['cust_id', 'personal_account','web_admin_contact_id','primary_billing_contact_id','payment_terms','bill_to_same_as_main_address','bt_address1','bt_address2','bt_address3','bt_city','bt_country_iso','bt_state','bt_region_id','bt_zip','fein','fax','website','customer_type_code','customer_deletion_flag','po_required','auth_buyers_required','do_not_mail_invoices','blind_dropship_enabled','ship_collect_enabled'
                ].includes(index)) {
                    if(value === false){
                        value = 0
                    }
                    if(value === true){
                        value = 1
                    }
                    let attribute_str = index+':'+value;
                    kkAttributes.push(attribute_str);
                }
                if(['address1','address2','address3'].includes(index)){
                    if (value) {
                        streetLines.push(value);
                    }
                }
            });
            kkAttributeParams = {
                "kk_attributes": kkAttributes
            };
            logger.info('44444444444444444' + JSON.stringify(kkAttributeParams))
            if(stgCompany['ac_company_id']){
                params = {
                    "company": {
                        "id": stgCompany['ac_company_id'],
                        "company_name": formattedData['company_name'],
                        "legal_name": formattedData['legal_name'],
                        "company_email": formattedData["company_email"],
                        "super_user_id": formattedData["super_user_id"],
                        "region": formattedData["region"],
                        "postcode": formattedData["postcode"],
                        "city": formattedData["city"],
                        "country_id": formattedData["country_id"],
                        "street": streetLines,
                        "extension_attributes": kkAttributeParams
                    }
                };
            }else{
                params = {
                    "company": {
                        "company_name": formattedData['company_name'],
                        "legal_name": formattedData['legal_name'],
                        "company_email": formattedData["company_email"],
                        "super_user_id": formattedData["super_user_id"],
                        "region": formattedData["region"],
                        "postcode": formattedData["postcode"],
                        "city": formattedData["city"],
                        "country_id": formattedData["country_id"],
                        "street": streetLines,
                        "customer_group_id": 1,
                        "telephone":"123-456-7890",
                        "extension_attributes": kkAttributeParams
                    }
                };
            }

            logger.info('555555555555555555555' + JSON.stringify(params))
            let syncStatus = "O"; // Assum sucess
            let syncNotes = 'Processing...';
            companyParams.push(
                {
                    "missedRequiredFields": missedRequiredFields,
                    "stgCompany": stgCompany,
                    "formattedData": formattedData,
                    "companyParams": params,
                    "syncStatus": syncStatus,
                    "syncNotes": syncNotes
                }
            )
        }

        try {
            // Handling companies in parallel to speed up the process.
            const promises = companyParams.map(companyParam => _handleCompany(companyParam));
            const results = await Promise.all(promises)
            // logger.info(results);
            for (let i = 0; i < stgCompanies.length; i++) {
                valuesLabels.push({
                        ...stgCompanies[i],
                        ...(results.find((itmInner) => itmInner.id === stgCompanies[i].id))
                    }
                );
            }

            logger.info('=======' + JSON.stringify(valuesLabels))
            data.AioAcErpCompanys = valuesLabels;
            const resourceUrl = constants.AIOACERPCOMPANY_URI
            //
           // logger.info(resourceUrl);
            const companyProcess = await oauth.post(resourceUrl, data)
            return results;
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

    _reformatDataContact = async function (adminContact) {
        let formattedData = {};
        const rawData = JSON.parse(adminContact.raw_data);
        const mapping = constants.CONTACT_ATTRIBUTE_MAPPINGS;
        formattedData = _populateRequiredFields(rawData,mapping);
        return formattedData;
    }

    _populateRequiredFields = (row,mapping) => {
        for (const acCode in mapping) {
            let erpCode = mapping[acCode];
            if (row.hasOwnProperty(erpCode)) {
                row[acCode] = row[erpCode];
            }
        }
        return row;
    }

    _reformatDataCompany = async function (stgCompany,CompanySuperUserMapping) {
        let formattedData = {};
        const rawData = JSON.parse(stgCompany.raw_data);
        let cust_id = stgCompany.cust_id;
        const mapping = constants.COMPANY_ATTRIBUTE_MAPPINGS;
        formattedData = _populateRequiredFields(rawData,mapping);
       // return formattedData;
        return {
        ...formattedData,
        ...CompanySuperUserMapping[cust_id]
        }
    }


    _handleContact = async function (contactParam) {
        let { missedRequiredFields, stgContact, formattedData, contactParams, syncStatus, syncNotes } = contactParam;
        let mapping = {};
        if (missedRequiredFields.length > 0) {
            syncStatus = 'F';
            syncNotes = "Missing required fields: " + JSON.stringify(missedRequiredFields);
        } else {
            try {
                let contactInfo = {};
                // Create or update the admin contact
                if (contactParams?.customer?.id) {
                     contactInfo = await oauth.put(constants.CONTACT_URI+'/'+contactParams.customer.id, contactParams);
                } else {
                     contactInfo = await oauth.post(constants.CONTACT_URI, contactParams);
                }

             //  logger.info( '2222233333' +  JSON.stringify(contactInfo))
                syncNotes = 'admin contact create/update successfully';
                const formatteddata = formattedData;
                let cust_id = formatteddata.cust_id;
                let ac_contact_id = contactInfo.id;
                let adminEmail = contactInfo.email;
                mapping = {
                    "cust_id":cust_id,
                    "ac_contact_id":ac_contact_id,
                    "email":adminEmail
                }
              //  logger.info('********************************')
                logger.info('************' + JSON.stringify(mapping))
            } catch (error) {
                logger.error(error)
                let errorObj = _handleError(error, syncStatus, syncNotes);
                syncStatus = errorObj["sync_status"]
                syncNotes = 'admin contact create/update failed with error: ' + errorObj["sync_notes"];
            }

        }
        return {
            "sync_status": syncStatus,
            "sync_notes": syncNotes,
            'sync_dt': new Date().toISOString().slice(0, 19).replace('T', ' '),
            "id": stgContact.id,
            "mapping":mapping
        }

    }

    _handleCompany = async function (companyParam) {
        let { missedRequiredFields, stgCompany, formattedData, companyParams, syncStatus, syncNotes } = companyParam;
        let mapping = {};
        if (missedRequiredFields.length > 0) {
            syncStatus = 'F';
            syncNotes = "Missing required fields: " + JSON.stringify(missedRequiredFields);
        } else {
            try {
                // Create or update the admin contact
                let companyInfo = await oauth.post(constants.COMPANY_URI, companyParams);
                syncNotes = 'company create/update successfully';

            } catch (error) {
                logger.error(error)
                let errorObj = _handleError(error, syncStatus, syncNotes);
                syncStatus = errorObj["sync_status"]
                syncNotes = 'Company create/update failed with error: ' + errorObj["sync_notes"];
            }

        }
        return {
            "sync_status": syncStatus,
            "sync_notes": syncNotes,
            'sync_dt': new Date().toISOString().slice(0, 19).replace('T', ' '),
            "id": stgCompany.id
        }

    }

    return instance
}

module.exports = {
    companyContactSync
}
