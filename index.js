const websitePrinter = require('./WebsitePrinter');
// let printer = new websitePrinter('https://en.cppreference.com/w/c', 'creference', 'https://en.cppreference.com');
// let dirtyElements = [
//     ".printfooter",
//     "#carbonads",
//     "#mw-head",
//     "#cpp-footer-base",
//     ".t-navbar"
// ]

// let printer = new websitePrinter('https://nodejs.org/docs/latest-v13.x/api/', 'Node.js-v13.x', 'https://nodejs.org/docs/latest-v13.x/api/');
let printer = new websitePrinter('https://getting-started-with-xapian.readthedocs.io/en/latest/', 'xapian-latest', 'https://getting-started-with-xapian.readthedocs.io/en/latest/');
printer.run();
