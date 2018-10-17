var express = require('express');
var router = express.Router();
var Web3 = require('web3');
var async = require('async');

router.post('/', function (req, res, next) {
	var searchString = req.body.search.trim().toLowerCase();
	var config = req.app.get('config');
	var web3 = new Web3();
	web3.setProvider(config.selectParity());

	if (searchString.length > 22 && searchString.substr(0, 2) != '0x')
		searchString = '0x' + searchString;

	if (searchString.length === 2) {
		return next({
			message: "Error: Invalid search string!"
		});
	} else if (searchString.length < 22) {
		// Most likely a block number, forward to block id handler
		res.redirect('/block/' + searchString);
	} else if (searchString.length == 66) {
		async.waterfall([
			function (callback) {
				web3.eth.getTransaction(searchString, function (err, result) {
					return callback(err, result);
				});
			},
			function (tx, callback) {
				web3.eth.getBlock(searchString, function (err, result) {
					return callback(err, tx, result);
				});
			}
		], function (err, tx, block) {
			if (tx && tx.hash) {
				res.redirect('/tx/' + searchString);
			} else if (block && block.hash) {
				res.redirect('/block/' + searchString);
			} else {
				return next({
					message: "Error: Invalid search string!"
				});
			}
		});
	} else if (searchString.length == 42) {
		res.redirect('/account/' + searchString);
	} else {
		return next({
			message: "Error: Invalid search string!"
		});
	}
});

module.exports = router;