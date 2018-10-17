const express = require('express');
const router = express.Router();

const async = require('async');
const Web3 = require('web3');
const redis = require("redis");
const geoip = require('geoip-lite');
const iso = require('iso-3166-1');
const tcpPortUsed = require('tcp-port-used');

const pre_fix = 'explorerPeers:';

router.get('/:json?', function (req, res, next) {
	var config = req.app.get('config');
	var web3 = new Web3();
	web3.setProvider(config.selectParity());
	var data = {};
	data.peers = [];

	const client = redis.createClient();
	client.on("error", function (err) {
		console.log("Error " + err);
	});

	async.waterfall([
		function (callback) {
			var rds_key = pre_fix.concat("list");
			client.hgetall(rds_key, function (err, replies) {
				var pre_fields = [];
				for (var hkey in replies) {
					pre_fields.push(hkey);
				}
				callback(err, pre_fields);
			});
		},
		function (pre_fields, callback) {
			async.eachSeries(pre_fields, function (field, eachCallback) {
				client.hgetall(pre_fix.concat(field), function (err, peer_info) {
					if (err) {
						eachCallback(err);
					} else {
						if (peer_info && peer_info.scanmstime > (new Date()).getTime() - 60 * 60 * 24 * 7 * 1000) {
							var sIP = peer_info.ip.split(".");
							sIP[1] = "***";
							peer_info.ip = sIP.join(".");
							data.peers.push(peer_info);
						}
						eachCallback();
					}
				});
			}, function (err) {
				callback(data.peers, err);
			});
		}
	], function (peers, err) {
		//client.quit();
		if (err) {
			console.log("Error " + err);
		}

		if (req.params.json || req.params.json !== undefined) {
			peers = peers.sort((a, b) => {
				if (!b.port) {
					return -1;
				}
				if (!a.port) {
					return 1;
				}

				if (parseInt(a.port, 10) == 50505) {
					return -1;
				}
				if (parseInt(b.port, 10) == 50505) {
					return 1;
				}

				if (parseInt(a.port, 10) < parseInt(b.port, 10)) {
					return 1;
				}
				if (parseInt(a.port, 10) > parseInt(b.port, 10)) {
					return -1;
				}
				return 0;
			});

			var stringJson;
			if (req.params.json == "gesn") {
				stringJson = "[\n";
				peers.forEach(element => {
					//console.dir(element.enode);
					if (element.enode) {
						stringJson = stringJson.concat('"', element.enode, '",', '\n');
					}
				});
				stringJson = stringJson.slice(0, -1); //'\n'
				stringJson = stringJson.slice(0, -1); //','
				stringJson = stringJson.concat('\n]');
				res.type('text/plain; charset=utf-8');
				res.set('Content-Type', 'text/plain');
				res.send(new Buffer(stringJson));
			} else if (req.params.json == "addpeer") {
				stringJson = "";
				peers.forEach(element => {
					//console.dir(element.enode);
					if (element.enode) {
						stringJson = stringJson.concat('admin.addPeer("', element.enode, '")\n');
					}
				});
				res.type('text/plain; charset=utf-8');
				res.set('Content-Type', 'text/plain');
				res.send(new Buffer(stringJson));
			} else if (req.params.json == "parity") {
				stringJson = "";
				peers.forEach(element => {
					//console.dir(element.enode);
					if (element.enode) {
						stringJson = stringJson.concat(element.enode, '\n');
					}
				});
				res.type('text/plain; charset=utf-8');
				res.set('Content-Type', 'text/plain');
				res.send(new Buffer(stringJson));
			} else {
				res.json(resultToJson(null, peers));
			}
		} else {
			data.peers = data.peers.sort((a, b) => {
				if (!b.scanmstime) {
					return -1;
				}
				if (!a.scanmstime) {
					return 1;
				}
				if (a.scanmstime < b.scanmstime) {
					return 1;
				}
				if (a.scanmstime > b.scanmstime) {
					return -1;
				}
				return 0;
			});
			var arrExe = [];
			var arrVer = [];
			var arrOs = [];
			var arrGover = [];
			var arrGeo = [];
			for (var h in data.peers) {
				if (typeof data.peers[h].exe === 'undefined' || typeof data.peers[h].ver === 'undefined' || typeof data.peers[h].os === 'undefined' || typeof data.peers[h].gover === 'undefined' || typeof data.peers[h].geo === 'undefined') {
					continue;
				}
				arrExe.push(data.peers[h].exe);
				arrVer.push(data.peers[h].ver);
				arrOs.push(data.peers[h].os);
				arrGover.push(data.peers[h].gover);
				arrGeo.push(data.peers[h].geo);
			}

			data.commands = makeReturnSeries(arrExe);
			data.versions = makeReturnSeries(arrVer);
			data.oss = makeReturnSeries(arrOs);
			data.goversions = makeReturnSeries(arrGover);
			data.geo = makeReturnSeries(arrGeo);
			data.geoCategories = makeGeoCategories(arrGeo);
			res.render('peers', {
				peers: data.peers,
				commands: data.commands,
				versions: data.versions,
				oss: data.oss,
				goversions: data.goversions,
				geo: data.geo,
				geoCategories: data.geoCategories,
				jsload_defer: config.jsload_defer,
				jsload_async: config.jsload_async
			});
		}
	});
});

module.exports = router;

function resultToJson(err, param) {
	var result = {};
	result.jsonrpc = 'esn';
	result.success = false;

	if (err) {
		result.result = err;
	} else if (param) {
		result.result = param;
		result.success = true;
	} else {
		result.result = NaN;
	}
	return result;
}

function makeReturnSeries(arr) {
	prcArray = [];
	prcArray = arr.reduce(function (acc, curr) {
		if (acc[curr]) {
			acc[curr] += 1;
		} else {
			acc[curr] = 1;
		}
		return acc;
	}, {});
	resArray = [];
	for (var kcmd in prcArray) {
		resArray.push({
			name: kcmd,
			y: prcArray[kcmd]
		});
	}
	return JSON.stringify(resArray);
}

function makeGeoCategories(arr) {
	var prcArray = [];
	prcArray = arr.reduce(function (acc, curr) {
		if (acc[curr]) {
			acc[curr] += 1;
		} else {
			acc[curr] = 1;
		}
		return acc;
	}, {});

	var colors = ['#f28f43', '#0d233a', '#8bbc21', '#910000', '#1aadce',
		'#492970', '#2f7ed8', '#77a1e5', '#c42525', '#a6c96a'
	];
	var result = {};
	result.categories = [];
	result.data = [];

	var idx = 0;
	for (var kcmd in prcArray) {
		if (idx > (colors.length - 1)) {
			return JSON.stringify(result);
		}

		var spArray = kcmd.split(", ");
		var country = null;
		if (iso.whereAlpha2(spArray[1])) {
			country = iso.whereAlpha2(spArray[1]).country;
		}
		if (!country) {
			country = spArray[1];
		}

		var subCategories = {};
		if (!(result.categories.includes(country))) {
			result.categories.push(country);
			subCategories.y = prcArray[kcmd];
			subCategories.color = colors[idx];
			subCategories.drilldown = {};
			subCategories.drilldown.name = country;
			subCategories.drilldown.categories = [];
			subCategories.drilldown.categories.push(spArray[0] + ", " + country);
			subCategories.drilldown.data = [];
			subCategories.drilldown.data.push(prcArray[kcmd]);
			result.data.push(subCategories);
			idx++;
		} else {
			for (var rLeni = 0; rLeni < result.data.length; rLeni++) {
				if (result.data[rLeni].drilldown.name == country) {
					result.data[rLeni].y += prcArray[kcmd];
					result.data[rLeni].drilldown.categories.push(spArray[0] + ", " + country);
					result.data[rLeni].drilldown.data.push(prcArray[kcmd]);
				}
			}
		}
	}
	return JSON.stringify(result);
}