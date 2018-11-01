var express = require('express');
var router = express.Router();
router.get('/', function (req, res, next) {
    res.render('api', {
        hostname: req.hostname
    });
});

module.exports = router;