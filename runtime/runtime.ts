import * as base from "./base"
import * as handle from "./handle"
import * as imagejs from 'image-js';

export class Runtime extends handle.Handle {

   constructor() {
      super();

      base.Base.taskCount += 1;
   }

   // 开始执行
   public async AsyncStart(data: base.IData) {
      this.db = Object.assign({}, data.DB)
      try {
         await this.do(data.Json)
      } catch (e) {
         if (typeof e === "string" && e == "break") { }
         else if (this.page) {
            const screenshot = (await this.page.screenshot({ type: "png", encoding: "binary" }))
            const img = (await imagejs.default.load(screenshot))
            // const height = img.height
            // const compress = img.resize({ height: height <= 500 ? height : height / 2 })
            this.saveScreenshot("throw", img.toDataURL())
            throw e
         } else {
            throw e
         }
      } finally {
         if (this.finally) {
            while (this.finally.length > 0) {
               await this.do(this.finally.pop())
            }
         }
      }
   }

   // 获取执行结果
   public SyncGetResult(): base.IResult {
      return { DB: this.db, Logs: this.logs, Screenshots: this.screenshots }
   }

   // 清理为关闭的窗口
   public Close() {
      base.Base.taskCount -= 1;
      if (base.Base.taskCount < 0) {
         base.Base.taskCount = 0;
      }
      this.handleAsyncShutdown(null)
   }
}