var Twit = require('twit');
var config = require('./src/config')

var TwitterFollowers = require('./src/Followers');
var twitterHandler = new Twit(config);

var followersHandler = new TwitterFollowers(twitterHandler);

const followedTwitterHandle = 'rkarna14';
const followersCheckList = [
    'actor7R', //true, different case
    'BBhuwanbhatt', //true, different case
    'Cristiano', //false
];

followersHandler.getFollowingStatus(followedTwitterHandle, followersCheckList)
    .then(data => console.log(data));
