class PageNode {
    constructor(name, url, level) {
        this.name = name;
        this.url = url;
        this.level = level;
        this.children = [];
    }
    // 设置父节点
    setParent(page_node) {
        this.parent = page_node;
    }
    // 获取父节点
    getParent() {
        return this.parent;
    }
    // 添加子节点
    addChild(page_node) {
        this.children.push(page_node);
    }
    getChildren(){
        return this.children;
    }
}
module.exports.PageNode = PageNode;