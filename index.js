const websitePrinter = require('./WebsitePrinter');
let printer = new websitePrinter('https://en.cppreference.com/w/cpp', 'cppreference', 'https://en.cppreference.com');
let dirtyElements = [
    ".printfooter"
]
printer.setDirtyGlobalNodes(dirtyElements);
printer.build();
