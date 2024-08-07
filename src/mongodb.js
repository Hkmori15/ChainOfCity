const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI);

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'Connection to mongoDB failed:'));
db.once('open', function () {
	console.log('Connected to mongoDB');
});

module.exports = mongoose;
