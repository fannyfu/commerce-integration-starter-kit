const { Core } = require('@adobe/aio-sdk')
const {
    errorResponse,
    stringParameters,
    checkMissingRequestInputs
} = require('../utils')
const { getCommerceOauthClient } = require('../oauth1a')
const { processControl } = require("../../lib/commerce/process_control")
const { companyContactSync } = require("../../lib/commerce/company_contact")
const constants = require("../../lib/commerce/constants")

// main function that will be executed by Adobe I/O Runtime
async function main(params) {
    // create a Logger
    const logger = Core.Logger('main', { level: params.LOG_LEVEL || 'info' })

    try {
        // 'info' is the default level if not set
        logger.info('Calling the contact sync from AC staging to AC action')

        // log parameters, only if params.LOG_LEVEL === 'debug'
        // logger.debug(stringParameters(params))

        // check for missing request input parameters and headers
        const requiredParams = [/* add required params */]
        // const requiredHeaders = ['Authorization']
        const requiredHeaders = []
        const errorMessage = checkMissingRequestInputs(params, requiredParams, requiredHeaders)

        if (errorMessage) {
            // return and log client errors
            return errorResponse(400, errorMessage, logger)
        }

        /*
          Todo:
          check for required env variables
          if missing required env variables return and log server errors
        */

        // init the commerce oauth client
        const oauth = getCommerceOauthClient(
            {
                url: params.COMMERCE_BASE_URL,
                consumerKey: params.COMMERCE_CONSUMER_KEY,
                consumerSecret: params.COMMERCE_CONSUMER_SECRET,
                accessToken: params.COMMERCE_ACCESS_TOKEN,
                accessTokenSecret: params.COMMERCE_ACCESS_TOKEN_SECRET
            },
            logger
        )
        const compaycontactsync = companyContactSync(oauth, logger)
        const processcontrol = processControl(oauth, logger)

        // Check if any products need to be synced
        let currentPage = 1
        // let pageSize = constants.CC_SYNC_STG_TO_AC_BATCH_COUNT
        let pageSize = constants.CC_SYNC_STG_TO_AC_BATCH_COUNT
        //add contact status filter
        let contactfilters = [];
        let syncStatuses = ['N']
        let statusfilter = {
            "field": "sync_status",
            "value": syncStatuses.join(","),
            "condition_type": "in"
        };
        contactfilters.push(statusfilter);
        let stgContacts = await compaycontactsync.getContacts(pageSize, currentPage,contactfilters)
        const totalCount = stgContacts["total_count"];
        const totalBatches = Math.min(totalCount, constants.CC_SYNC_STG_TO_AC_PROCESS_COUNT) / pageSize;
        let retrievedCount = stgContacts["items"].length;
        logger.info(`Total ${totalCount} contacts needs to be processed.`)
        logger.info(`Retrieved ${retrievedCount} contacts to be processed in page ${currentPage}.`)
        if (totalCount > 0) {
            // call AC API to search if there is any process are running.
            const runningProcesses = await processcontrol.findRunningProcessByTask(constants.CONTACT_SYNC_STG_TO_AC)
            // console.log(runningProcesses)
            if (runningProcesses.total_count > 0) {
                logger.info("Warning: There are " + runningProcesses.total_count + " contact sync from AC staging to AC process running. Please check the log.")
                const response = {
                    statusCode: 500,
                    body: JSON.stringify({
                        "error": "Warning: There are " + runningProcesses.total_count + " contact sync from AC staging to AC process running. Please check the log."
                    })
                }
                return response;
            }

            /*
            call AC API to insert a processing record in aio_ac_erp_sync_log (id will be in the response)
            {{ _.COMMERCE_BASE_URL }}/rest/default/V1/aioacerpsynclog
            */
            let process = await processcontrol.insertProcess(
                constants.CONTACT_SYNC_STG_TO_AC,
                "Retrieving contact from AC staging to create/update in AC"
            )

            let customerCompanyIdMapping = {};
            let companyfilters = [];
            stgContacts.items.forEach(stgContact => {
                customerCompanyIdMapping[stgContact.contact_id] = stgContact.cust_id;
            });
            logger.info('1111111111111111' + JSON.stringify(customerCompanyIdMapping))

            let companyCustIdFilter = {
                "field": "cust_id",
                "value": Object.values(customerCompanyIdMapping).join(','),
                "condition_type": "in"
            };
            companyfilters.push(companyCustIdFilter);
            let assignCompanies = await compaycontactsync.getCompanies(100, 1,companyfilters);
            let companyCustIdMapping = {};
            assignCompanies.items.forEach(assignCompany => {
                companyCustIdMapping[assignCompany.cust_id] = assignCompany.ac_company_id;
            });
            logger.info('22222' + JSON.stringify(companyCustIdMapping))
            for (let key in customerCompanyIdMapping) {
                if (customerCompanyIdMapping.hasOwnProperty(key)) {
                    let valueToReplace = customerCompanyIdMapping[key];

                    if (companyCustIdMapping.hasOwnProperty(valueToReplace)) {
                        customerCompanyIdMapping[key] = companyCustIdMapping[valueToReplace];
                    }
                }
            }
            logger.info('33333' + JSON.stringify(customerCompanyIdMapping))
            //create/update contact to ac contact

            let CompanySuperUserMapping = await compaycontactsync.updateContactToAc(stgContacts["items"], customerCompanyIdMapping)


            let processedPage = 1
            while (
                retrievedCount < totalCount &&
                retrievedCount < constants.CC_SYNC_STG_TO_AC_PROCESS_COUNT
                ) {
                processedPage += 1

                stgContacts = await compaycontactsync.getContacts(pageSize, processedPage,contactfilters)
                retrievedCount = retrievedCount + stgContacts["items"].length

                 customerCompanyIdMapping = {};
                 companyfilters = [];
                stgContacts.items.forEach(stgContact => {
                    customerCompanyIdMapping[stgContact.contact_id] = stgContact.cust_id;
                });
                logger.info('1111111111111111' + JSON.stringify(customerCompanyIdMapping))

                 companyCustIdFilter = {
                    "field": "cust_id",
                    "value": Object.values(customerCompanyIdMapping).join(','),
                    "condition_type": "in"
                };
                companyfilters.push(companyCustIdFilter);
                assignCompanies = await compaycontactsync.getCompanies(100, 1,companyfilters);
                companyCustIdMapping = {};
                assignCompanies.items.forEach(assignCompany => {
                    companyCustIdMapping[assignCompany.cust_id] = assignCompany.ac_company_id;
                });
                logger.info('22222' + JSON.stringify(companyCustIdMapping))
                for (let key in customerCompanyIdMapping) {
                    if (customerCompanyIdMapping.hasOwnProperty(key)) {
                        let valueToReplace = customerCompanyIdMapping[key];

                        if (companyCustIdMapping.hasOwnProperty(valueToReplace)) {
                            customerCompanyIdMapping[key] = companyCustIdMapping[valueToReplace];
                        }
                    }
                }
                logger.info('33333' + JSON.stringify(customerCompanyIdMapping))
                //create/update contact to ac contact

                let CompanySuperUserMapping = await compaycontactsync.updateContactToAc(stgContacts["items"], customerCompanyIdMapping)

                logger.info(`Retrieved ${retrievedCount} company to be processed in page ${processedPage}.`)
                if (processedPage > totalBatches) {
                    break;
                }
            }
            // update the process in aio_ac_erp_sync_log to warning, complete, or failed
            process.last_end_dt = new Date().toISOString().slice(0, 19).replace('T', ' ')
            process.sync_status = constants.SYNC_STATUS_COMPLETE
            process.sync_notes = `Total ${totalCount} contacts needs to be processed. ${retrievedCount} contact are prodessed in this batch.`
            process = await processcontrol.updateProcess(process)

            const response = {
                statusCode: 200,
                body: process.sync_notes
            }
            logger.info(JSON.stringify(response))
            return response
        } else {
            const notes = "No data in AC staging table to be processed.";
            const response = {
                statusCode: 200,
                body: notes
            }
            logger.info(JSON.stringify(response))
            return response
        }
    } catch (error) {
        logger.error(error)
        return errorResponse(500, 'server error', logger)
    }
}

exports.main = main
