const async = require('async');
const tcpPortUsed = require('tcp-port-used');
const redis = require("redis");
const client = redis.createClient();

var checker = function (ip, port, delay) {
  var self = this;
  self.ip = ip;
  self.port = port;
  self.prevTime = new Date();
  client.on("error", function (err) {
    console.log("Error " + err);
  });

  async.forever(
    function (next) {
      self.prevTime = new Date();
      var rds_key = 'PortCheck:'.concat(self.ip).concat(':').concat(self.port);
      tcpPortUsed.check(self.port, self.ip)
        .then(function (inUse) {
          var now = new Date();
          var msnow = Date.parse(now);
          var diffms = now - self.prevTime;
          //console.log('PortCheck:', self.ip, self.port, ':', inUse, now, msnow, diffms);

          if (!inUse) {
            client.hset(rds_key, msnow, 0);
          } else {
            client.hset(rds_key, msnow, diffms);
          }
          client.expireat(rds_key, parseInt((+new Date())/1000) + 86400);

          setTimeout(function () {
            next();
          }, delay);
        }, function (err) {
          var now = new Date();
          console.log('PortCheck Error:', self.ip, self.port, ':', now);
          console.error('PortCheck Error:', err.message);
          client.hset(rds_key, msnow, 0);
          client.expireat(rds_key, parseInt((+new Date())/1000) + 86400);
          setTimeout(function () {
            next();
          }, delay);
        });
    },
    function (err) {
      console.log('!!!! serverPortCheckService STOP ', self.ip, self.port, '!!!!');
    }
  );
};

module.exports = checker;