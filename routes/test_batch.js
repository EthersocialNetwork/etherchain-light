var express = require('express');
var router = express.Router();

var async = require('async');
var Web3 = require('web3');

router.get('/', function (req, res, next) {
  var config = req.app.get('config');
  var web3 = new Web3();
  web3.setProvider(config.provider);
  var batch = new web3.BatchRequest();
  for (var i = 0; i < 4400; i++) {
    batch.add(web3.eth.getBalance.request(accounts[i]));
  }
  batch.requestManager.sendBatch(batch.requests, function (err, results) {
    if (err) {
      console.log(err);
      return;
    }
    results = results || [];
    batch.requests.map(function (request, index) {
      return results[index] || {};
    }).forEach(function (result, i) {
      balances[batch.requests[i].params[0]] = batch.requests[i].format ? batch.requests[i].format(result.result) : result.result;
    });
    //console.log(balances); // uncomment it to print out
  });

  res.render('test_batch', {
    uncle: uncle,
    blockHash: req.params.hash
  });
  uncle = null;

});

module.exports = router;