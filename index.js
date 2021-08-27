const websitePrinter = require('./WebsitePrinter');
let printer = new websitePrinter('https://en.cppreference.com/w/cpp', 'cppreference', 'https://en.cppreference.com');
let container = [
    "#cpp-content-base",
]
let dirtyElements = [
    "#mw-head","#cpp-footer-base",".printfooter"
]
printer.setLevelLinks(levelLinks);
printer.build();
