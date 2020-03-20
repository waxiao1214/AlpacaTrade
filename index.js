var http = require('http');
var person = require('./test.js');
var person1 = new person('James', 'Bond');
console.log(person1.fullName());
