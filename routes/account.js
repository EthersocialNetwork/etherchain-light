var express = require('express');
var router = express.Router();

var async = require('async');
var Web3 = require('web3');

router.get('/:account', function (req, res, next) {

    var config = req.app.get('config');
    var web3 = new Web3();
    web3.setProvider(config.provider);
    var db = req.app.get('db');

    var data = {};
    var blocks = {};

    async.waterfall([
            function (callback) {
                web3.eth.getBlock("latest", false, function (err, result) {
                    callback(err, result); //마지막 블럭 정보를 받아서 전달
                });
            },
            function (lastBlock, callback) {
                data.lastBlock = lastBlock.number;
                //limits the from block to -1000 blocks ago if block count is greater than 1000
                if (data.lastBlock > 0x3E8) {
                    data.fromBlock = data.lastBlock - 0x3E8;
                } else {
                    data.fromBlock = 0x00;
                } //범위를 마지막블럭에서 1,000블럭을 뺀 블럭까지 설정
                web3.eth.getBalance(req.params.account, function (err, balance) {
                    callback(err, balance); //해당 계정의 보유량을 받아서 전달
                });
            },
            function (balance, callback) {
                data.balance = balance;
                web3.eth.getCode(req.params.account, function (err, code) {
                    callback(err, code); //해당 계정의 코드를 받아서 전달
                });
            },
            function (code, callback) {
                data.code = code;
                if (code !== "0x") {
                    data.isContract = true;
                    db.get(req.params.account.toLowerCase(), function (err, value) {
                        callback(null, value); //디비에서 해당 계정의 정보를 가지고 온다.
                    });
                } else {
                    callback(null, null);
                }
            },
            function (source, callback) {
                if (source) {
                    data.source = JSON.parse(source);
                    console.log(data.source);
                    data.contractState = [];
                    if (!data.source.abi) {
                        return callback();
                    }
                    var abi = JSON.parse(data.source.abi);
                    var contract = web3.eth.contract(abi).at(req.params.account);

                    async.eachSeries(abi, function (item, eachCallback) {
                        if (item.type === "function" && item.inputs.length === 0 && item.constant) {
                            try {
                                contract[item.name](function (err, result) {
                                    data.contractState.push({
                                        name: item.name,
                                        result: result
                                    });
                                    eachCallback();
                                });
                            } catch (e) {
                                console.log(e);
                                eachCallback();
                            }
                        } else {
                            eachCallback();
                        }
                    }, function (err) {
                        callback(err, null);
                    });

                } else {
                    callback(null, null);
                }
            },
            function (res, callback) {
                web3.trace.filter({
                    "fromBlock": "0x" + data.fromBlock.toString(16),
                    "toBlock": "0x" + data.lastBlock.toString(16) //[req.params.account]
                }, function (err, traces) {
                    callback(err, traces);
                });
            },
            function (traces, callback) {
                async.eachSeries(traces, function (trace, eachCallback) {
                    async.setImmediate(function () {
                        const num = trace.blockNumber;
                        const account_name = req.params.account.toLowerCase();
                        var isPush = false;
                        if (trace.type === 'reward' && trace.action.author && trace.action.author.toLowerCase() == account_name) {
                            isPush = true;
                        } else if (trace.type === 'call' && (trace.action.from.toLowerCase() == account_name || trace.action.to.toLowerCase() == account_name)) {
                            isPush = true;
                        }
                        if (isPush) {
                            if (!blocks[num]) {
                                blocks[num] = [];
                            }
                            blocks[num].push(trace);
                        }
                        eachCallback();
                    });
                }, function (err) {
                    callback(err, null);
                });
            }
        ],
        function (err) {
            if (err) {
                return next(err);
            }

            data.address = req.params.account;
            data.officialurl = 'https://ethersocial.net/addr/' + data.address;

            data.blocks = [];
            for (var block in blocks) {
                data.blocks.push(blocks[block]);
            }

            if (data.source) {
                data.name = data.source.name;
            } else if (config.names[data.address]) {
                data.name = config.names[data.address];
            }

            data.blocks = data.blocks.reverse().splice(0, 100);

            res.render('account', {
                account: data
            });
        });
});

module.exports = router;