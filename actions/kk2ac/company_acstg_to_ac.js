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
        logger.info('Calling the company and contact sync from AC staging to AC action')

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

        // Check if any companies need to be synced
        let currentPage = 1
        // let pageSize = constants.CC_SYNC_STG_TO_AC_BATCH_COUNT
        let pageSize = constants.CC_SYNC_STG_TO_AC_BATCH_COUNT


        //add company status filter
        let syncStatuses = ['N']
        let companyfilters = []
        let statusfilter = {
            "field": "sync_status",
            "value": syncStatuses.join(","),
            "condition_type": "in"
        };
        companyfilters.push(statusfilter);
        let stgCompanies = await compaycontactsync.getCompanies(pageSize, currentPage,companyfilters)
        const totalCount = stgCompanies["total_count"];
        const totalBatches = Math.min(totalCount, constants.CC_SYNC_STG_TO_AC_PROCESS_COUNT) / pageSize;
        let retrievedCount = stgCompanies["items"].length;
        logger.info(`Total ${totalCount} company needs to be processed.`)
        logger.info(`Retrieved ${retrievedCount} company to be processed in page ${currentPage}.`)
        if (totalCount > 0) {
            // call AC API to search if there is any process are running.
            const runningProcesses = await processcontrol.findRunningProcessByTask(constants.CC_SYNC_STG_TO_AC)
            // console.log(runningProcesses)
            if (runningProcesses.total_count > 0) {
                logger.info("Warning: There are " + runningProcesses.total_count + " company contact sync from AC staging to AC process running. Please check the log.")
                const response = {
                    statusCode: 500,
                    body: JSON.stringify({
                        "error": "Warning: There are " + runningProcesses.total_count + " company contact sync from AC staging to AC process running. Please check the log."
                    })
                }
                return response;
            }

            /*
            call AC API to insert a processing record in aio_ac_erp_sync_log (id will be in the response)
            {{ _.COMMERCE_BASE_URL }}/rest/default/V1/aioacerpsynclog
            */
            let process = await processcontrol.insertProcess(
                constants.CC_SYNC_STG_TO_AC,
                "Retrieving company contact from AC staging to create/update in AC"
            )
            let custAdminContactMapping = {};
            let contactfilters = [];
            stgCompanies.items.forEach(stgCompany => {
                custAdminContactMapping[stgCompany.cust_id] = stgCompany.web_admin_contact_id;
            });
            logger.info('1111111111111111' + JSON.stringify(custAdminContactMapping))

            //add contact id filters
            let contactIdfilter = {
                "field": "contact_id",
                "value": Object.values(custAdminContactMapping).join(','),
                "condition_type": "in"
            };
            contactfilters.push(contactIdfilter);
            let adminContacts = await compaycontactsync.getContacts(100, 1,contactfilters);

            //create/update admin contact to ac company.
            let CompanySuperUserMapping = await compaycontactsync.updateAdminContactToAc(adminContacts["items"], custAdminContactMapping)

            let attributesMapping = await compaycontactsync.updateCompanyToAc(stgCompanies["items"], CompanySuperUserMapping)
            let processedPage = 1
            while (
                retrievedCount < totalCount &&
                retrievedCount < constants.CC_SYNC_STG_TO_AC_PROCESS_COUNT
                ) {
                processedPage += 1
                contactfilters = [];
                companyfilters = [];
                custAdminContactMapping = {};
                // pageSize = Math.min(totalCount - retrievedCount, constants.PRODUCT_SYNC_STG_TO_AC_BATCH_COUNT);

                //add company status filter
                let syncStatuses = ['N']
                let statusfilter = {
                    "field": "sync_status",
                    "value": syncStatuses.join(","),
                    "condition_type": "in"
                };
                companyfilters.push(statusfilter);

                stgCompanies = await compaycontactsync.getCompanies(pageSize, processedPage,companyfilters)
                retrievedCount = retrievedCount + stgCompanies["items"].length


                stgCompanies.items.forEach(stgCompany => {
                    custAdminContactMapping[stgCompany.cust_id] = stgCompany.web_admin_contact_id;
                });
                logger.info('1111111111111111' + JSON.stringify(custAdminContactMapping))
                //add admin contact id filter
                let contactIdfilter = {
                    "field": "contact_id",
                    "value": Object.values(custAdminContactMapping).join(','),
                    "condition_type": "in"
                };
                contactfilters.push(contactIdfilter);
                adminContacts = await compaycontactsync.getContacts(100, 1,contactfilters);

                //create/update admin contact to ac company.
                CompanySuperUserMapping = await compaycontactsync.updateAdminContactToAc(adminContacts["items"], custAdminContactMapping)

                let attributesMapping = await compaycontactsync.updateCompanyToAc(stgCompanies["items"], CompanySuperUserMapping)

                logger.info(`Retrieved ${retrievedCount} company to be processed in page ${processedPage}.`)
                if (processedPage > totalBatches) {
                    break;
                }
            }
            // update the process in aio_ac_erp_sync_log to warning, complete, or failed
            process.last_end_dt = new Date().toISOString().slice(0, 19).replace('T', ' ')
            process.sync_status = constants.SYNC_STATUS_COMPLETE
            process.sync_notes = `Total ${totalCount} company needs to be processed. ${retrievedCount} company are prodessed in this batch.`
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
