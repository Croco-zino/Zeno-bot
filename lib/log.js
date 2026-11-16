import chalk from "chalk"
import { format } from "util"

const logger = {
  info(...args) {
    console.log(
      chalk.bold.bgRgb(51, 204, 51)(" INFO "),
      `[${chalk.white(new Date().toUTCString())}]:`,
      chalk.cyan(format(...args))
    )
  },

  error(...args) {
    console.log(
      chalk.bold.bgRgb(247, 38, 33)(" ERROR "),
      `[${chalk.white(new Date().toUTCString())}]:`,
      chalk.rgb(255, 38, 0)(format(...args))
    )
  },

  warn(...args) {
    console.log(
      chalk.bold.bgRgb(255, 153, 0)(" WARN "),
      `[${chalk.white(new Date().toUTCString())}]:`,
      chalk.yellow(format(...args))
    )
  },

  trace(...args) {
    console.log(
      chalk.gray(" TRACE "),
      `[${chalk.white(new Date().toUTCString())}]:`,
      chalk.white(format(...args))
    )
  },

  debug(...args) {
    console.log(
      chalk.bold.bgRgb(66, 167, 245)(" DEBUG "),
      `[${chalk.white(new Date().toUTCString())}]:`,
      chalk.white(format(...args))
    )
  }
}

export default logger