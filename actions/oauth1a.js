/*
Copyright 2022 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

const Oauth1a = require('oauth-1.0a')
const crypto = require('crypto')
const got = require('got')
const fetch = require("node-fetch");

/**
 * This function return the Adobe commerce OAuth client
 *
 * @returns {object} - The Oauth client
 * @param {object} options - include the information to configure oauth
 * @param {object} logger - Logger
 */
function getOauthClient (options, logger) {
  const instance = {}

  // Remove trailing slash if any
  const serverUrl = options.url
  const apiVersion = options.version
  const oauth = Oauth1a({
    consumer: {
      key: options.consumerKey,
      secret: options.consumerSecret
    },
    signature_method: 'HMAC-SHA256',
    hash_function: hashFunctionSha256
  })
  const token = {
    key: options.accessToken,
    secret: options.accessTokenSecret
  }

  /**
   * This function create the sha 256 hash
   *
   * @returns  {string} - returns generated hash
   * @param {string} baseString - base string
   * @param {string} key - key to encrypt
   */
  function hashFunctionSha256 (baseString, key) {
    return crypto.createHmac('sha256', key).update(baseString).digest('base64')
  }

  /**
   * This function make the call to the api
   *
   * @returns {object} - returns the call response
   * @param {object} requestData - include the request data
   * @param {string} requestToken - access token
   * @param {object} customHeaders - include custom headers
   */
  async function apiCall (requestData, requestToken = '', customHeaders = {}) {
    try {
      logger.debug('Fetching URL: ' + requestData.url + ' with method: ' + requestData.method)

      const headers = {
        ...(requestToken
          ? { Authorization: 'Bearer ' + requestToken }
          : oauth.toHeader(oauth.authorize(requestData, token))),
        ...customHeaders
      }
      logger.info(JSON.stringify(requestData.body))
      logger.info(JSON.stringify(headers))
      const response =  await fetch(requestData.url, {
        method: requestData.method,
        headers: {
          ...headers,
          'Content-Type': 'application/json' // 确保设置 Content-Type 头
        },
        body: JSON.stringify(requestData.body) // 转换 body 为 JSON 字符串
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json(); // 解析 JSON 响应

    } catch (error) {
      logger.error(`Error fetching URL ${requestData.url}: ${error}`)
      throw error
    }
  }

  instance.consumerToken = async function (loginData) {
    return apiCall({
      url: createUrl('integration/customer/token'),
      method: 'POST',
      body: loginData
    })
  }

  instance.get = async function (resourceUrl, requestToken = '') {
    const requestData = {
      url: createUrl(resourceUrl),
      method: 'GET'
    }
    return apiCall(requestData, requestToken)
  }

  /**
   * This function create the full url
   *
   * @returns {string} - generated url
   * @param {string} resourceUrl - Adobe commerce rest API resource url
   */
  function createUrl (resourceUrl) {
    return serverUrl + apiVersion + '/' + resourceUrl
  }

  instance.post = async function (resourceUrl, data, requestToken = '', customHeaders = {}) {
    const requestData = {
      url: createUrl(resourceUrl),
      method: 'POST',
      body: data
    }
    return apiCall(requestData, requestToken, customHeaders)
  }

  instance.put = async function (resourceUrl, data, requestToken = '', customHeaders = {}) {
    const requestData = {
      url: createUrl(resourceUrl),
      method: 'PUT',
      body: data
    }
    return apiCall(requestData, requestToken, customHeaders)
  }

  instance.delete = async function (resourceUrl, requestToken = '') {
    const requestData = {
      url: createUrl(resourceUrl),
      method: 'DELETE'
    }
    return apiCall(requestData, requestToken)
  }

  return instance
}

/**
 * This function create the oauth client to use for calling adobe commerce api
 *
 * @returns {object} - returns the oauth client
 * @param {object} options - define the options for the client
 * @param {object} logger - define the Logger
 */
function getCommerceOauthClient (options, logger) {
  options.version = 'V1'
  options.url = options.url + 'rest/'
  return getOauthClient(options, logger)
}

/**
 * Converts a search criteria object into a query string format.
 * @param {object} searchCriteria - The search criteria object to convert.
 * @param {string} [parentKey=''] - The parent key to use for nested objects.
 * @returns {string} The query string representation of the search criteria.
 */
function convertSearchCriteriaToString(searchCriteria, parentKey = '') {
  if (typeof searchCriteria !== 'object' || searchCriteria === null) {
    // Handle non-object values
    return `${parentKey}=${encodeURIComponent(searchCriteria)}`;
  }

  let queryString = '';

  for (const key in searchCriteria) {
    if (searchCriteria.hasOwnProperty(key)) {
      const value = searchCriteria[key];
      const newKey = parentKey ? `${parentKey}[${key}]` : key;

      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          queryString += convertSearchCriteriaToString(value[i], `${newKey}[${i}]`) + '&';
        }
      } else if (typeof value === 'object' && value !== null) {
        queryString += convertSearchCriteriaToString(value, newKey) + '&';
      } else {
        queryString += `${newKey}=${encodeURIComponent(value)}&`;
      }
    }
  }

  // Remove the trailing "&" if it exists
  if (queryString.endsWith('&')) {
    queryString = queryString.slice(0, -1);
  }

  return queryString;
}

module.exports = {
  getOauthClient,
  getCommerceOauthClient,
  convertSearchCriteriaToString
}
