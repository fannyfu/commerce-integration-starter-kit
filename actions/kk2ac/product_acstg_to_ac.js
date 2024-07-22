const { Core } = require('@adobe/aio-sdk')
const {
    errorResponse,
    stringParameters,
    checkMissingRequestInputs
} = require('../utils')
const { getCommerceOauthClient } = require('../oauth1a')
const { processControl } = require("../../lib/commerce/process_control")
const { productSync } = require("../../lib/commerce/product")
const constants = require("../../lib/commerce/constants")

// main function that will be executed by Adobe I/O Runtime
async function main(params) {
    // create a Logger
    const logger = Core.Logger('main', { level: params.LOG_LEVEL || 'info' })

    try {
        // 'info' is the default level if not set
        logger.info('Calling the product sync from AC staging to AC action')

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
        const productsync = productSync(oauth, logger)
        const processcontrol = processControl(oauth, logger)

        // Check if any products need to be synced
        let currentPage = 1
        let pageSize = constants.PRODUCT_SYNC_STG_TO_AC_BATCH_COUNT
        let productMasters = await productsync.getProductMasters(pageSize, currentPage)
        const totalCount = productMasters["total_count"];
        const totalBatches = Math.min(totalCount, constants.PRODUCT_SYNC_STG_TO_AC_PROCESS_COUNT) / pageSize;
        let retrievedCount = productMasters["items"].length;
        logger.info(`Total ${totalCount} products needs to be processed.`)
        logger.info(`Retrieved ${retrievedCount} products to be processed in page ${currentPage}.`)
        if (totalCount > 0) {
            // call AC API to search if there is any process are running.
            const runningProcesses = await processcontrol.findRunningProcessByTask(constants.PRODUCT_SYNC_STG_TO_AC_TASK)
            // console.log(runningProcesses)
            if (runningProcesses.total_count > 0) {
                logger.info("Warning: There are " + runningProcesses.total_count + " product sync from AC staging to AC process running. Please check the log.")
                const response = {
                    statusCode: 500,
                    body: JSON.stringify({
                        "error": "Warning: There are " + runningProcesses.total_count + " product sync from AC staging to AC process running. Please check the log."
                    })
                }
                return response;
            }

            /* 
            call AC API to insert a processing record in aio_ac_erp_sync_log (id will be in the response)
            {{ _.COMMERCE_BASE_URL }}/rest/default/V1/aioacerpsynclog 
            */
            let process = await processcontrol.insertProcess(
                constants.PRODUCT_SYNC_STG_TO_AC_TASK,
                "Retrieving products from AC staging to create/update products in AC"
            )
            let attributeMappings = await productsync.retrieveAttributeMappings();
            let attributesMapping = await productsync.updateProductMasterToAc(productMasters["items"], attributeMappings?.attributes)
            let processedPage = 1
            while (
                retrievedCount < totalCount &&
                retrievedCount < constants.PRODUCT_SYNC_STG_TO_AC_PROCESS_COUNT
            ) {
                processedPage += 1
                // pageSize = Math.min(totalCount - retrievedCount, constants.PRODUCT_SYNC_STG_TO_AC_BATCH_COUNT);
                productMasters = await productsync.getProductMasters(pageSize, currentPage)
                retrievedCount = retrievedCount + productMasters["items"].length
                attributesMapping = await productsync.updateProductMasterToAc(productMasters["items"], attributesMapping)
                logger.info(`Retrieved ${retrievedCount} products to be processed in page ${processedPage}.`)
                if (processedPage > totalBatches) {
                    break;
                }
            }
            // update the process in aio_ac_erp_sync_log to warning, complete, or failed
            process.last_end_dt = new Date().toISOString().slice(0, 19).replace('T', ' ')
            process.sync_status = constants.SYNC_STATUS_COMPLETE
            process.sync_notes = `Total ${totalCount} products needs to be processed. ${retrievedCount} products are prodessed in this batch.`
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
