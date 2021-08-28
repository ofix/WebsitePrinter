const websitePrinter = require('./WebsitePrinter');
let printer = new websitePrinter('https://en.cppreference.com/w/c', 'creference', 'https://en.cppreference.com');
let dirtyElements = [
    ".printfooter",
    "#carbonads",
    "#mw-head",
    "#cpp-footer-base",
    ".t-navbar"
]
printer.setDirtyGlobalNodes(dirtyElements);
printer.run();
