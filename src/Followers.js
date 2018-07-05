class Profile {
    constructor(twitterHandler) {
        this.twitterHandler = twitterHandler;
        this.nonMappedIds = [];
    }

    /**
     * @param  {integer} nextCursor - mandatory, required for paginated requests
     * @param  {object} params - mandatory, request parameters
     * @param  {function} resolve - resolve callback for promise
     * @param  {function} reject - reject callback for promise
     * @param  {function} dataKeyToExtract - data value we are interested from response
     * @param  {string} apiUrl - url we are making paginated request to
     * @param  {integer[]} results=[] - referenced array where the results will be stored
     */
    processCursoredRequest(nextCursor, params, resolve, reject, dataKeyToExtract, apiUrl, results = []) {
        const requestParams = JSON.parse(JSON.stringify(params));
        requestParams.cursor = nextCursor;
        this.twitterHandler.get(apiUrl, requestParams, (err, data, res) => {
            if (err) {
                reject(err);
            }
            results = results.concat(data[dataKeyToExtract]);
            if (data.next_cursor) {
                this.processCursoredRequest(data.next_cursor, requestParams, resolve, reject, dataKeyToExtract, apiUrl, results);
            } else {
                return resolve(results);
            }
        });
    }

    /**
     * @param  {string[]} bucketedIds - mandatory, list of string twitter ids for which the screeen names are to be fetched
     * note => bucketedIds supports max length upto 100
     * this is a windowed request with maximum of 300 requests per 15 minute window in app auth context
     */
    getUsersInfoByIds(bucketedIds) {
        if (bucketedIds.length > 100) {
            throw 'users/lookup api call cannot be made for more than 100 twitter ids at a time';
        }
        let requestParams = {
            user_id: bucketedIds.join(','),
            include_entities: false,
            tweet_mode: false,
        };
        return new Promise((resolve, reject) => {
            this.twitterHandler.get('users/lookup', requestParams, (err, data, res) => {
                if (err) {
                    console.log(err);
                    return reject(err);
                }
                const pickedData = data.map(item => ({ screen_name: item.screen_name, id_str: item.id_str }));
                if (bucketedIds.length !== pickedData.length) {
                    /* console.log(`One or more twitter handles couldn't be mapped to twitter id and their following status will be skipped`); */
                    const mappedIds = pickedData.map(item => item.id_str);
                    bucketedIds.forEach((item) => {
                        if (mappedIds.indexOf(item) < 0) {
                            this.nonMappedIds.push(item);
                        }
                    })
                }
                return resolve(pickedData.map(item => item.screen_name.toLowerCase()));
            });
        });
    }

    /**
     * @param  {string[]} twitterIdsList - mandatory, list of string twitter ids for which the screeen names are to be fetched
     */
    transformTwitterIdsToScreenNames(twitterIdsList) {
        const maxUsersAtOnce = 100;
        const twitterIds = JSON.parse(JSON.stringify(twitterIdsList));
        const twitterIdsBucketList = [];
        while (twitterIds.length) {
            twitterIdsBucketList.push(twitterIds.splice(0, maxUsersAtOnce));
        }
        const idToScreenNameRequests = twitterIdsBucketList.map(twitterIdsBucket => this.getUsersInfoByIds(twitterIdsBucket));
        return Promise.all(idToScreenNameRequests).then(resultList => {
            const concatenatedList = [].concat.apply([], resultList);
            return Promise.resolve(concatenatedList);
        });
    }

    /**
     * Gets all the followers ids of a specific user
     * @param  {string} screen_name - optional if user_id is supplied
     * @param  {string} user_id - optional if screen_name is supplied
     * @returns {string[]} - list of all ids referring to the follower twitter ids
     * usage => getAllFollowersIdsOfSpeficUser('RobertDowneyJr')
     */
    getAllFollowersIdsOfSpeficUser(screen_name, user_id) {
        let params = {};
        if (screen_name) {
            params = { screen_name }
        } else if (user_id) {
            params = { user_id }
        } else {
            throw `Invalid parameters supplied while fetching follower ids of user => screen_name: ${screen_name}, user_id: ${user_id}`;
        }
        params = {
            screen_name,
            count: 5000,
            stringify_ids: true,
        };
        const dataKeyToExtract = 'ids';
        const apiUrl = 'followers/ids';
        return new Promise((resolve, reject) => {
            this.processCursoredRequest(-1, params, resolve, reject, dataKeyToExtract, apiUrl);
        });
    }


    /**
     * @param  {string} followedTwitterHandle - mandatory, should be a string correspondig to the twitter handle name like 'RobertDowneyJr'
     * @param  {string[]} followerCheckList - mandatory, should be string array of twitter ids like ['13231232421', '42342342343', '32432432']
     * @returns {object} - object containing twitterId as key and true/false depending on the following status as value
     * usage => getFollowingStatus('RobertDowneyJr', ['jmeyer43', 'huge', 'ila_home'])
     * sampleOutput => {'jmeyer43': true, 'huge': false, 'ila_home': true}
     */
    getFollowingStatus(followedTwitterHandle, followerCheckList) {
        const followingStatuses = {};
        return this.getAllFollowersIdsOfSpeficUser(followedTwitterHandle)
            .then((followerIdsList) => {
                return this.transformTwitterIdsToScreenNames(followerIdsList);
            })
            .then(followerNamesList => {
                if (this.nonMappedIds.length > 0) {
                    console.log('-----------------------------------------------------------------------');
                    console.log(`These follower accounts of ${followedTwitterHandle} could be protected/suspended and hence their profile info couldn't be retrieved.\nThe following status of these kind of accounts will be set to false in the results`);
                    console.log(this.nonMappedIds);
                    console.log('-----------------------------------------------------------------------');
                }
                followerCheckList.forEach(screenNameToBeChecked => {
                    if (followerNamesList.indexOf(screenNameToBeChecked.toLowerCase()) > -1) {
                        followingStatuses[screenNameToBeChecked] = true;
                    } else {
                        followingStatuses[screenNameToBeChecked] = false;
                    }
                });
                return Promise.resolve(followingStatuses);
            });
    }
}

module.exports = Profile;