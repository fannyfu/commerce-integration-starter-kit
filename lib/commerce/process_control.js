const constants = require('./constants');
const {
    convertSearchCriteriaToString
} = require('../../actions/oauth1a')

function processControl(oauth, logger) {
    const instance = {}
    const options = {}

    /**
     * Finds a running process by the given task.
     * @param {string} task - The task to search for.
     * @returns {Promise<any>} - A promise that resolves to the content of the running process.
     */
    instance.findRunningProcessByTask = async function (task) {
        const runningProcessSearchCriteria = {
            "pageSize": 5,
            "currentPage": 1,
            "filterGroups": [
                {
                    "filters": [
                        {
                            "field": "task",
                            "value": task,
                            "condition_type": "eq"
                        }
                    ]
                },
                {
                    "filters": [
                        {
                            "field": "sync_status",
                            "value": "processing",
                            "condition_type": "eq"
                        }
                    ]
                }
            ]
        }
        const searchCriteriaString = convertSearchCriteriaToString(runningProcessSearchCriteria, "searchCriteria")
        const content = await oauth.get(constants.AIOACERPSYNCLOG_URI + "?" + searchCriteriaString)
        return content
    }

    /**
     * Inserts a new process into the AIO AC ERP Sync Log.
     * @param {string} task - The task associated with the process.
     * @param {string} notes - Additional notes for the process.
     * @returns {Promise} A promise that resolves to the inserted process.
     */
    instance.insertProcess = async function (task, notes) {
        const resourceUrl = constants.AIOACERPSYNCLOG_URI
        const data = {
            "aioAcErpSyncLog": {
                "store_id": "1", // need to be dynamical 
                "task": task,
                "sync_status": constants.SYNC_STATUS_PROCESSING,
                "last_cutoff_entity_id": null, // not using
                "last_cutoff_dt": null, // not using
                "last_start_dt": new Date().toISOString().slice(0, 19).replace('T', ' '),
                "last_end_dt": "",
                "email_notification": null, // not using
                "sync_notes": notes,
                "file_name": null // not using
            }
        }
        const process = await oauth.post(resourceUrl, data)
        return process
    }

    /**
     * Updates the given process by making a PUT request to the specified resource URL.
     * @param {object} process - The process object to update.
     * @returns {Promise<object>} - A promise that resolves to the updated process object.
     */
    instance.updateProcess = async function (process) {
        const resourceUrl = constants.AIOACERPSYNCLOG_URI + "/" + process.id
        const data = {
            "aioAcErpSyncLog": process
        }
        process = await oauth.put(resourceUrl, data)
        return process
    }

    return instance
}

module.exports = {
    processControl
}
