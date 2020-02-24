import * as puppeteer from "puppeteer";
import * as axios from "axios"
import * as utils from "./utils"
import * as base from "./base"
import * as installMouseHelper from './install-mouse-helper'

export class Handle extends utils.Utils {

   // ========== Puppeteer ==========

   // 启动Puppeteer，会尝试连接已经打开的Puppeteer
   // Options是启动新Puppeteer所需要的参数，可参考Puppeteer官方文档
   // { "Cmd": "bootPuppeteer", "Comment": "启动Puppeteer", "Options": { "headless": true, "args": ["--no-sandbox"], "defaultViewport": null } }
   protected async handleAsyncBootPuppeteer(cmd: base.ICmd) {
      let ws: string
      try { ws = (await axios.default.get('http://127.0.0.1:9222/json/version')).data.webSocketDebuggerUrl } catch (e) { }
      if (ws != "") this.log("ws:", ws)
      this.browser = (ws ? await puppeteer.connect({ browserWSEndpoint: ws, defaultViewport: null }) : await puppeteer.launch(cmd.Options))
      this.isPuppeteer = true
      this.isMultilogin = false
   }

   // ========== Multilogin ==========

   // 创建Multilogin指纹，Options是设置一些必要的参数
   // 创建成功，指纹ID会存入profileId字段
   // Key是创建指纹需要的动态参数
   // { "Cmd": "createMultilogin", "Comment": "创建multilogin指纹", Key:"createOption", "Options": {"multilogin": "http://127.0.0.1:45000"}},
   protected async handleAsyncCreateMultilogin(cmd: base.ICmd) {
      const profileId = this.multiloginProfileId
      const createOption = this.getValue(cmd)
      const url = "https://api.multiloginapp.com/v2/profile?token=" + process.env.MultiloginToken + "&mlaVersion=" + createOption.mlaVersion + "&defaultMode=FAKE";
      const opt = this.createMultiloginProfile(createOption)
      const rs = (await axios.default.post(url, opt)).data;
      // 成功返回：{"uuid": "c0e42b54-fbd5-41b7-adf3-673e7834f143"}
      // 失败返回：{"status": "ERROR","value": "os: must match \"lin|mac|win|android\""}
      if (rs.status == "ERROR") {
         this.log("Multilogin指纹创建失败:", rs.value)
         throw { message: rs.value }
      }
      // 
      this.setValue(profileId, rs.uuid)
   }

   // 启动Multilogin指纹，指纹ID从Key读取，Key未设置默认为profileId，Options是设置一些必要的参数
   // { "Cmd": "bootMultilogin", "Comment": "连接multilogin", "Key": "profileId", "Options": {"multilogin": "http://127.0.0.1:45000"} },
   protected async handleAsyncBootMultilogin(cmd: base.ICmd) {
      let profileId = this.getValue(cmd)
      if (!profileId) profileId = this.multiloginProfileId
      await this.asyncStartMultilogin(cmd, profileId)
   }

   // 删除Multilogin指纹，指纹ID从Key读取，Key未设置默认为profileId
   // { Cmd: "removeMultilogin", Comment: "删除Multilogin指纹", Key: "profileId" },
   protected async handleAsyncRemoveMultilogin(cmd: base.ICmd) {
      if (!this.isMultilogin) return
      const url = "https://api.multiloginapp.com/v1/profile/remove?token=" + process.env.MultiloginToken + "&profileId=" + this.getValue(cmd);
      const rs = (await axios.default.get(url)).data;
      // 成功返回：{"status":"OK"}
      // 失败返回：{"status":"ERROR","value":"profile not found"}
      if (rs.status == "ERROR") {
         this.log("Multilogin指纹删除失败:", rs.value)
         throw { message: rs.value }
      }
   }

   // ========== 浏览器 ==========

   // 访问指定的网址，从Key或Value获取网址，Options可以设置Puppeteer支持的导航参数
   // { "Cmd": "navigation", "Comment": "浏览器打开百度", "Key": "url", "Options": { waitUntil: "domcontentloaded" } }
   protected async handleAsyncNavigation(cmd: base.ICmd) {
      await Promise.race([
         this.page.goto(this.getValue(cmd), cmd.Options).catch(e => void e),
         new Promise(() => { })
      ]);
   }

   // 创建新的Page
   // { "Cmd": "newPage", "Comment": "创建新页面" }
   protected async handleAsyncNewPage(cmd: base.ICmd) {
      this.page = await this.browser.newPage();
   }

   // 选择一个已有的Page或新建一个Page
   // { "Cmd": "alwaysPage", "Comment": "选择一个已有的或新建一个页面" }
   protected async handleAsyncAlwaysPage(cmd: base.ICmd) {
      const ps = await this.browser.pages()
      this.page = ps.length ? ps.shift() : await this.browser.newPage();
   }

   // 刷新当前page
   // { "Cmd": "reloadPage", "Comment": "刷新页面", WaitNav: true }
   protected async handleAsyncReloadPage(cmd: base.ICmd) {
      await this.page.reload()
   }

   // 关闭当前page
   // { "Cmd": "closePage", "Comment": "关闭页面" }
   protected async handleAsyncClosePage(cmd: base.ICmd) {
      this.page.close()
      this.page = undefined
   }

   // 关闭浏览器
   // { "Cmd": "shutdown", "Comment": "关闭程序" }
   protected async handleAsyncShutdown(cmd: base.ICmd) {
      this.browser.close()
   }

   // 设置Header，此功能Multilogin无效，Options为Header的键值对
   // { "Cmd": "setHeader", "Comment": "设置Header，Multilogin中无效", "Options": { "Accept-Language": "zh-CN,zh;q=0.9" } }
   protected async handleAsyncSetHeader(cmd: base.ICmd) {
      if (this.isMultilogin) return this.log("Multilogin忽略set header")
      await this.page.setExtraHTTPHeaders(<puppeteer.Headers>cmd.Options);
   }

   // 设置默认超时时间，时间从Key或Value中读取
   // { "Cmd": "setDefaultNavigationTimeout", "Comment": "设置默认打开页面超时时间，时间来自Key或Value", "Value": "5000" },
   protected handleSyncSetDefaultNavigationTimeout(cmd: base.ICmd) {
      this.page.setDefaultNavigationTimeout(Number(this.getValue(cmd)));
   }

   // ========== 用户输入 ==========

   // 鼠标移动到元素上，Index用于多元素的索引
   // { "Cmd": "hover", "Comment": "鼠标hover", "Selector": "#su", "Index":"用于多个元素的索引" }
   protected async handleAsyncHover(cmd: base.ICmd) {
      await this.handleAsyncWaitForSelector(cmd)
      let rect: base.IRect
      if (!cmd.Index) {
         //@ts-ignore
         await this.page.$eval(cmd.Selector, (el) => el.scrollIntoViewIfNeeded())
         const el = await this.page.$(cmd.Selector)
         rect = await el.boundingBox()
      } else {
         const index = this.getIndex(cmd)
         //@ts-ignore
         await this.page.$$eval(cmd.Selector, (els, index) => els[index].scrollIntoViewIfNeeded(), index)
         const els = await this.page.$$(cmd.Selector)
         rect = await els[index].boundingBox()
      }
      const point = this.calcElementPoint(rect)
      await this.page.mouse.move(point.x, point.y, { steps: 1 })
      await this.page.waitFor(this.random(this.userInputWaitMin, this.userInputWaitMax))
   }

   // 单击元素，Index用于多元素的索引
   // 内置先移动到元素上再点击
   // { "Cmd": "click", "Comment": "点击搜索", "Selector": "#su", "Index":"用于多个元素的索引" }
   protected async handleAsyncClick(cmd: base.ICmd) {
      await this.handleAsyncWaitForSelector(cmd)
      await this.handleAsyncHover(cmd)
      const clickCount = (cmd.Options && cmd.Options["clickCount"]) || 1
      let rect: base.IRect
      if (!cmd.Index) {
         const el = await this.page.$(cmd.Selector)
         rect = await el.boundingBox()
      } else {
         const els = await this.page.$$(cmd.Selector)
         rect = await els[this.getIndex(cmd)].boundingBox()
      }
      const point = this.calcElementPoint(rect)
      // var ts,te;document.addEventListener("mousedown",function(){ts=new Date()});document.addEventListener("mouseup",function(){te=new Date();console.log(te-ts)})
      if (cmd.WaitNav === true) {
         await Promise.all([
            this.page.waitForNavigation(),
            this.page.mouse.click(point.x, point.y, { delay: this.random(50, 200) }),
         ]);
      } else {
         await this.page.mouse.click(point.x, point.y, { clickCount: clickCount, delay: this.random(50, 200) })
      }
      await this.page.waitFor(this.random(this.userInputWaitMin, this.userInputWaitMax))
   }

   // 双击元素，Index用于多元素的索引
   // 内置先移动到元素上再双击
   // { "Cmd": "dbClick", "Comment": "双击点击", "Selector": "#kw", "Index":"用于多个元素的索引" }
   protected async handleAsyncDbClick(cmd: base.ICmd) {
      if (!cmd.Options) cmd.Options = {}
      cmd.Options["clickCount"] = 2
      await this.handleAsyncClick(cmd)
   }

   // 在输入框中输入数据，数据来源于Key或Value，Index用于多元素的索引
   // 内置先移动到元素上双击全选内容，再输入内容
   // { "Cmd": "type", "Comment": "输入从DB读取的Key，或直接输入Value，默认延时500毫秒", "Selector": "#kw", "Key": "keyword", "Value": "keyword", Options: { delay: 500 } }
   protected async handleAsyncType(cmd: base.ICmd) {
      let delay = 500
      if (cmd.Options && cmd.Options["delay"]) delay = Number(cmd.Options["delay"])
      await this.handleAsyncWaitForSelector(cmd)
      await this.handleAsyncDbClick({ Cmd: "", Selector: cmd.Selector, Index: cmd.Index })
      await this.page.waitFor(this.random(this.userInputWaitMin, this.userInputWaitMax))
      await this.page.type(cmd.Selector, this.getValue(cmd), { delay: delay })
      await this.page.waitFor(this.random(this.userInputWaitMin, this.userInputWaitMax))
   }

   // 下拉框选择
   // { "Cmd": "select", "Comment": "下拉框选择Key或Value", "Selector": "#select1", "Value": "option1" },
   protected async handleAsyncSelect(cmd: base.ICmd) {
      await this.handleAsyncWaitForSelector(cmd)
      await this.page.select(cmd.Selector, this.getValue(cmd))
      await this.page.waitFor(this.random(this.userInputWaitMin, this.userInputWaitMax))
   }

   // ========== 其他功能 ==========

   // 过滤网络请求，过滤表达式来源于Key
   // { "Cmd": "filterRequest", "Comment": "过滤请求，变量_url", "Key": "/\.png$/.test(_url) || /\.jpg$/.test(_url)" }
   protected async handleAsyncFilterRequest(cmd: base.ICmd) {
      await this.page.setRequestInterception(true);
      this.page.on('request', interceptedRequest => {
         if (this.syncEval(cmd.Key, { _url: interceptedRequest.url() })) {
            interceptedRequest.abort();
         }
         else interceptedRequest.continue();
      });
   }

   // 等待页面加载完成，一般不需要主动调用
   // { "Cmd": "waitForNavigation", "Comment": "等待页面加载完成，一般不需要主动调用" }
   protected async handleAsyncWaitForNavigation(cmd: base.ICmd) {
      await this.page.waitForNavigation(cmd.Options)
   }

   // 主动时间等待，时间来自Key或Value
   // { "Cmd": "wait", "Comment": "等待", "Value": "30000" }
   protected async handleAsyncWait(cmd: base.ICmd) {
      const t = Number(this.getValue(cmd))
      return await this.page.waitFor(t)
   }

   // 主动随机等待，随机数最小最大在Options中设置
   // { "Cmd": "waitRand", "Comment": "随机等待", "Options": {"min": 2000, "max": 3000} }
   protected async handleAsyncWaitRand(cmd: base.ICmd) {
      const options = cmd.Options || {}
      const min = options.hasOwnProperty("min") ? options["min"] : 1000
      const max = options.hasOwnProperty("max") ? options["max"] : 5000
      const rand = Math.ceil(Math.random() * max) + min
      this.log("随机等待", rand)
      await this.page.waitFor(rand)
   }

   // 获取元素innerText文本内容，保存到Key字段中
   // { "Cmd": "textContent", "Comment": "获取textContent，保存到DB的Key中", "Selector": ".op-stockdynamic-moretab-cur-num", "Key": "text" }
   protected async handleAsyncTextContent(cmd: base.ICmd) {
      await this.handleAsyncWaitForSelector(cmd)
      return this.setValue(cmd.Key, await this.page.$eval(cmd.Selector, el => el.textContent))
   }

   // 获取元素innerHTML代码，保存到Key字段中
   // { "Cmd": "htmlContent", "Comment": "获取textContent，保存到DB的Key中", "Selector": ".op-stockdynamic-moretab-cur-num", "Key": "html" }
   protected async handleAsyncHtmlContent(cmd: base.ICmd) {
      await this.handleAsyncWaitForSelector(cmd)
      return this.setValue(cmd.Key, await this.page.$eval(cmd.Selector, el => el.innerHTML))
   }

   // 网络请求Value中的地址，获取的数据保存到Key字段中
   // { "Cmd": "httpGet", "Comment": "网络get请求Value地址，返回数据保存到Key中", Key: "ip", Value: "http://ip.lyl.hk" }
   protected async handleAsyncHttpGet(cmd: base.ICmd) {
      this.setValue(cmd.Key, (await axios.default.get(cmd.Value)).data)
   }

   // 自定义变量，Key=Value
   // { "Cmd": "var", "Comment": "将Value定义到变量Key，保存到DB中", "Key": "key1", "Value": "123" }
   protected handleSyncVar(cmd: base.ICmd) {
      this.setValue(cmd.Key, this.syncEval(cmd.Value))
   }

   // 记录日志Key或Value
   // { "Cmd": "log", "Comment": "记录Key或Value到日志", "Key": "key1", "Value": "123" }
   protected handleSyncLog(cmd: base.ICmd) {
      this.log(this.getValue(cmd))
   }

   // 执行Key或Value中的复杂的javascript脚本，将返回的对象属性保存到DB数据中
   // { "Cmd": "js", "Comment": "高级操作，执行javascript，返回对象保存到DB数据", "Value": "let _ip=(await axios.default.get('http://ip.lyl.hk')).data;return {ip2:_ip}" }
   protected async handleAsyncJs(cmd: base.ICmd) {
      const js = this.getValue(cmd)
      const result = await this.asyncEval(js)
      this.log("js", js)
      if (typeof result === "object") {
         for (let i in result) this.setValue(i, result[i])
      }
   }

   // 抛出错误信息Key或Value，终止当前的指令组
   // { "Cmd": "throw", "Comment": "中断所有操作，抛出Key或Value信息", "Key": "key1", "Value": "发现错误" }
   protected async handleAsyncThrow(cmd: base.ICmd) {
      throw { message: this.getValue(cmd) }
   }

   // 跳出当前的指令组，条件来自自Key或Value，条件空则视为无条件跳出
   // { "Cmd": "break", "Comment": "跳出循环", "Key": "满足条件才break/空就是无条件break" }
   protected async handleAsyncBreak(cmd: base.ICmd) {
      // 没定义条件，直接break
      if (!cmd.Key) throw "break"
      // 定义了条件，要满足条件才break
      if (this.getValue(cmd)) throw "break"
      this.log("break不满足")
   }

   // 显示鼠标坐标，方便调试
   // { "Cmd": "showMouse", "Comment": "显示鼠标"}
   protected async handleAsyncShowMouse(cmd: base.ICmd) {
      await installMouseHelper.installMouseHelper(this.page)
   }

   // 等待某个元素出现
   // { "Cmd": "waitForSelector", "Comment": "等待元素出现，一般不需要主动调用", "Selector":"选择器" }
   protected async handleAsyncWaitForSelector(cmd: base.ICmd) {
      await this.page.waitForSelector(cmd.Selector)
   }

   // 循环执行Json中的指令组，循环次数来自Key或Value
   // { "Cmd": "loop", "Comment": "循环Key或Value次数，内置loopCounter为循环计数器", Key: "循环次数", Value: "循环次数", "Json": [{Cmd...}] }
   protected async handleAsyncLoop(cmd: base.ICmd) {
      const count = Number(this.getValue(cmd))
      this.log("loop:", count)
      for (let i = 0; i < count; i++) {
         this.setValue("loopCounter", i.toString())
         try {
            await this.do(cmd.Json)
         } catch (e) {
            if (typeof e === "string" && e === "break") break
            throw e
         }
      }
   }

   // 生成随机数，最小最大值在Options中配置，数据带计算方法
   // { "Cmd": "random", "Comment": "生成随机数", "Key": "rand1", "Options": {"min":2, "max":5}}
   protected handleSyncRandom(cmd: base.ICmd) {
      this.setValue(cmd.Key, this.random(this.syncEval(cmd.Options["min"]), this.syncEval(cmd.Options["max"])).toString())
   }

   // 获取元素数量保存到Key中
   // { "Cmd": "elementCount", "Comment": "获取元素数量", "Selector": "#select1", "Key": "key1" },
   protected async handleAsyncElementCount(cmd: base.ICmd) {
      const els = await this.page.$$(cmd.Selector)
      this.setValue(cmd.Key, els.length.toString())
   }

   // 多条件判断，满足条件即执行Json指令组
   // { "Cmd": "condition", "Comment": "条件判断", "Conditions": [ { "Condition": "key1==123", "Json": [{Cmd...}] } ] }
   protected async handleAsyncCondition(cmd: base.ICmd) {
      try {
         for (let i in cmd.Conditions) {
            let condition = cmd.Conditions[i].Condition
            if (await this.getValue({ Cmd: "", Key: condition })) {
               this.log("true", condition)
               await this.do(cmd.Conditions[i].Json)
               break
            }
            this.log("false", condition)
         }
      } catch (e) {
         if (typeof e === "string" && e == "break") return
         throw e
      }
   }

   // 指令组定义，名称来自Key或Value
   // { "Cmd": "sub", "Comment": "定义一组操作集合", "Value": "sub1", "Json": [{Cmd...}] }
   protected handleSyncSub(cmd: base.ICmd) {
      if (!this.cmds) this.cmds = {}
      this.cmds[this.getValue(cmd)] = cmd.Json
   }

   // 调用指令组，名称来自Key或Value
   // { "Cmd": "call", "Comment": "调用操作集合", "Value": "sub1"}
   protected async handleAsyncCall(cmd: base.ICmd) {
      if (!this.cmds) this.cmds = {}
      if (!this.cmds.hasOwnProperty(this.getValue(cmd))) throw { message: "Not Found sub:" + this.getValue(cmd) }
      try {
         await this.do(this.cmds[this.getValue(cmd)])
      } catch (e) {
         if (typeof e === "string" && e == "break") return
         throw e
      }
   }

   // 定义一组操作，无论如何，最终都会执行这些操作
   // { "Cmd": "finally", "Comment": "无论如何，最终执行一些清理操作", "Json": [{Cmd...}] }
   protected handleSyncFinally(cmd: base.ICmd) {
      if (!this.finally) this.finally = []
      this.finally.push(cmd.Json)
   }

   // 执行指令组
   protected async do(cmds: base.ICmd[]) {
      for (let i in cmds) {
         this.log("CMD:", cmds[i].Cmd, cmds[i].Comment)
         const cmdAsync = "handleAsync" + cmds[i].Cmd.replace(/^\S/, s => { return s.toUpperCase() })
         const cmdSync = "handleSync" + cmds[i].Cmd.replace(/^\S/, s => { return s.toUpperCase() })

         if (typeof this[cmdAsync] === "function") await this[cmdAsync](cmds[i])
         else if (typeof this[cmdSync] === "function") this[cmdSync](cmds[i])
         else throw { message: "CmdNotFound" }
      }
   }
}