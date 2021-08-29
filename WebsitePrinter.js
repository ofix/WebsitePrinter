const fs = require('fs');
const https = require('https');
const iconv = require("iconv-lite");
const puppeteer = require('puppeteer-core');
const cheerio = require('cheerio');
const PDFMerger = require('pdf-merger-js');
const process = require('process');
//const chromePath = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const { PageNode } = require('./pageNode');
const { treeify } = require('./treeify');
const path = require("path");
const { PerformanceNodeTiming } = require('perf_hooks');
class WebsitePrinter {
    constructor(website_entry, pdf_name, website_base) {
        this.website_entry = website_entry; //网站根目录
        this.website_base = website_base;
        this.base_len = this.website_base.length;
        this.pdf_name = pdf_name; // PDF名称
        this.tree = new PageNode(null, this.pdf_name, this.website_root, 0); //层级一
        this.visited_urls = {}; // 已经访问过的URL集合
        this.pdf_urls = []; // 需要打印成PDF的URL集合
        this.stack = [];
        this.in_recover = false; //是否是recover模式
        this.dir_temp = './temp/' + pdf_name + '/';
        this.dir_meta = "./meta/" + pdf_name + '/';
        this.cacheFile = "./meta/" + pdf_name + '/cache.json';
        this.mkdirs(this.dir_temp);
        this.mkdirs(this.dir_meta);
        ////////////////////////////////////////////
        this.debug = true;
        this.hasDirtyElement = false;
        this.visible_node = "";
        this.invisible_node_children = [];
        this.dirty_global_nodes = [];
    }
    setVisibleNode(visible_node) {
        this.visible_node = visible_node;
    }
    setInvisibleNodeChildren(invisible_node_children) {
        this.invisible_node_children = invisible_node_children;
    }
    setDirtyGlobalNodes(dirty_global_nodes) {
        this.dirty_global_nodes = dirty_global_nodes;
        if (this.dirty_global_nodes.length > 0) {
            this.hasDirtyElement = true;
        }
    }
    // 访问单个页面
    async visitUrl(url, count) {
        return new Promise(function (resolve, reject) {
            console.log(count + " visit: " + url);
            const req = https.get(url, (res) => {
                let html = [];
                let size = 0;
                res.on('data', (data) => {
                    html.push(data);
                    size += data.length;
                });
                res.on("end", function () {
                    let buf = Buffer.concat(html, size);
                    let result = iconv.decode(buf, "utf8");//转码//var result = buff.toString();//不需要转编码,直接tostring
                    resolve(result);
                });
            });
            req.on('error', (e) => {
                reject(e);
            });
        });
    }
    // 提取单个页面的URL
    parseUrlsInPage(data, level, parent_node, parent_url) {
        let $ = cheerio.load(data);
        let that = this;
        $("body").each((index, item) => {
            let $a = $(item).find('a');
            $a.each((sub_index, url) => {
                let $url = $(url); //只查找当前页面的下一级目录
                let child_url = that.website_base + $url.attr('href');
                if (child_url.indexOf('#') == -1) {
                    if (that.isChildUrl(parent_url, child_url)) {
                        let name = $url.text().trim();
                        let node = new PageNode(name, child_url, level + 1);
                        parent_node.addChild(node);
                    }
                }
            });
        });
    }
    // 判断URl是否是父子关系
    isChildUrl(parent_url, child_url) {
        if (child_url.indexOf(parent_url) == -1) {
            return false;
        }
        let tail = child_url.substr(parent_url.length + 1);
        let parts = tail.split('/');
        if ((parts.length) > 1 || (parts[0] == '') || parts[0].substr(0, 1) == '#') {
            return false;
        }
        return true;
    }

    async run() {
        if (fs.existsSync(this.cacheFile)) {
            let data = fs.readFileSync(this.cacheFile, 'utf-8');
            this.pdf_urls = JSON.parse(data);
        } else {
            this.recoverFromCrash();
            let that = this;
            process.on('SIGINT', function () {
                console.log('>>>>>>> dump meta data <<<<<<<');;
                that.saveMetaFile(that.dir_meta + "_crash_.json");
                process.exit();
            });
            process.on('uncaughtException', function (err) {
                console.log('++++++++ caught exception: ' + err + " ++++++++");
                that.saveMetaFile(that.dir_meta + "crash.json");
            });
            await this.build();
            return;
        }
        let launchOptions = {
            executablePath: chromePath,
            devTools: true
        };
        puppeteer.launch(launchOptions).then(async browser => {
            await this.printChapters(browser, this.pdf_urls);
            await browser.close();
        }).then(async () => {
            await this.mergePartPdfFiles(this.pdf_urls, this.pdf_name);
            console.log("完成！ ^_^");
        });
    }

    async build() {
        // 深度遍历
        try {
            let count = 0;
            if (this.in_recover) {
                count = this.pdf_urls.length;
            } else {
                this.stack = [[this.website_entry, 0, this.pdf_name, this.tree]];
            }
            while (this.stack.length > 0) {
                let page = this.stack.shift();
                let url = page[0];
                let level = page[1];
                let name = page[2];
                let parent_node = page[3];
                // 访问过的URL不需要再次访问
                if (this.visited_urls.hasOwnProperty(url)) {
                    continue;
                }
                // 如果URL层级深度超过4，忽略
                if (level > 4) {
                    continue;
                }
                let data = await this.visitUrl(url, count + 1); // 访问单个页面
                this.visited_urls[url] = name;
                this.pdf_urls.push(url);
                this.parseUrlsInPage(data, level, parent_node, url); // 解析页面中的url
                let next_urls = parent_node.getChildren();
                for (let i = 0; i < next_urls.length; i++) {
                    this.stack.push([next_urls[i].url, next_urls[i].level, next_urls[i].name, next_urls[i]]);
                }
                count++;
            }
            this.saveMetaFile(this.dir_meta + "meta.json");
            this.saveCacheFile(this.tree);
        }
        catch (e) {
            console.log(e);
            this.saveMetaFile(this.dir_meta + "crash.json");
        }
    }

    saveMetaFile(file_name) {
        let o = {
            stack: this.stack,
            tree: this.tree,
            visited_urls: this.visited_urls,
            pdf_urls: this.pdf_urls
        };
        let data = JSON.stringify(o, null, 4);
        fs.writeFileSync(file_name, data);
    }

    recoverFromCrash() {
        if (fs.existsSync(this.dir_meta + "crash.json")) {
            let data = fs.readFileSync(this.dir_meta + "crash.json", 'utf-8');
            let o = JSON.parse(data);
            this.visited_urls = o.visited_urls;
            this.pdf_urls = o.pdf_urls;
            this.stack = o.stack;
            this.tree = o.tree;
            this.in_recover = true;
        }
    }

    saveCacheFile(tree) {
        //树的遍历
        let arr = this.treeToArray(tree, []);
        let print_urls = [];
        for (let i = 0; i < arr.length; i++) {
            print_urls.push([arr[i].url, arr[i].name, arr[i].level]); // url,name
        }
        let data = JSON.stringify(print_urls, null, 4);
        fs.writeFileSync(this.cacheFile, data);
    }

    treeToArray(root, arr) {
        if (root != null) {
            arr.push({ url: root.url, name: root.name, level: root.level });
            let child_nodes = root.getChildren();
            for (let i = 0; i < child_nodes.length; i++) {
                this.treeToArray(child_nodes[i], arr);
            }
        }
        return arr;
    }

    mkdirs(dirname) {
        if (fs.existsSync(dirname)) {
            return true;
        } else {
            if (this.mkdirs(path.dirname(dirname))) {
                fs.mkdirSync(dirname);
                return true;
            }
        }
    };

    async printChapters(browser, chapters) {
        let chapter_length = chapters.length;
        let chapter_radix = this.radix(chapter_length);
        for (let i = 0; i < chapter_length; i++) {
            let url = chapters[i][0];
            if (url == '') {
                continue;
            }
            let current_chapter = this.padZero((i + 1), chapter_radix);
            let result = await this.printPage(current_chapter, browser, url, chapters[i][1]);
            if (result == 0) {
                await this.sleep(100);
            }
        }
    }
    // 
    filterSpecialChars(str) {
        let pattern = new RegExp("[\\\\/:*?\".<>|]")
        let s = "";
        for (let i = 0; i < str.length; i++) {
            s = s + str.substr(i, 1).replace(pattern, '');
        }
        return s;
    }
    // 打印单个网页PDF
    async printPage(index, browser, url, filename) {
        //对文件名进行格式化
        let file_name = this.filterSpecialChars(filename);
        if (fs.existsSync(this.dir_temp + index + ". " + file_name + '.pdf')) {
            console.log(index + ". 打印 " + file_name + ".pdf [已缓存]");
            return 1;
        } else {
            console.log(index + ". 打印 " + file_name + ".pdf");
        }

        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle2' });
        await page.emulateMediaType('screen');
        if (this.hasDirtyElement) {
            await page.evaluate((dirty_global_nodes) => {
                // 移除全局的Dirty元素
                for (let i = 0; i < dirty_global_nodes.length; i++) {
                    let nodes = document.querySelectorAll(dirty_global_nodes[i]);
                    for (let j = 0; j < nodes.length; j++) {
                        nodes[j].style.display = 'none';
                    }
                }
            }, this.dirty_global_nodes);
        }
        await page.pdf({
            path: this.dir_temp + index + ". " + file_name + '.pdf',
            format: 'A4',
            printBackground: true,
        });
        return 0;
    }
    // 合并PDF
    async mergePartPdfFiles(data, fileName) {
        console.log("\n合并 " + fileName + ".pdf");
        let merger = new PDFMerger();
        let count = data.length;
        let radix = this.radix(count);
        for (let i = 0; i < count; i++) {
            let chapter_name = this.filterSpecialChars(data[i][1]);
            let pdf = this.dir_temp + this.padZero((i + 1), radix) + ". " + chapter_name + '.pdf';
            if (fs.existsSync(pdf)) {
                merger.add(pdf);
            }
        }
        await merger.save('./ebooks/' + fileName + '.pdf');
    }
    // 次序
    radix(digit) {
        let n = 0;
        do {
            digit = Math.floor(digit / 10);
            n++;
        } while (digit > 0);
        return n;
    }
    // 
    padZero(digit, N) {
        let n = 0;
        let tmp = digit;
        do {
            tmp = Math.floor(tmp / 10);
            n++;
        } while (tmp > 0)

        let str = '';
        for (let i = n; i < N; i++) {
            str += '0';
        }
        return str + digit;
    }
    // 休眠时间
    sleep(time = 0) {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                resolve();
            }, time);
        })
    }
}

module.exports = WebsitePrinter;