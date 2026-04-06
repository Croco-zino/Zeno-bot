import chalk from "chalk"

function printPairingBox(number, code) {
  const line = "─".repeat(46)

  console.log(chalk.cyan(`┌${line}┐`))
  console.log(
    chalk.cyan("│") +
    chalk.bold.white("       ZENO BOT CONNECT".padEnd(46)) +
    chalk.cyan("│")
  )
  console.log(chalk.cyan(`├${line}┤`))

  console.log(
    chalk.cyan("│ ") +
    chalk.yellow("Status".padEnd(10)) +
    chalk.white(" │ ") +
    chalk.green("WAITING FOR PAIRING".padEnd(28)) +
    chalk.cyan("│")
  )

  console.log(
    chalk.cyan("│ ") +
    chalk.yellow("Number".padEnd(10)) +
    chalk.white(" │ ") +
    chalk.white(number.padEnd(28)) +
    chalk.cyan("│")
  )

  console.log(
    chalk.cyan("│ ") +
    chalk.yellow("Code".padEnd(10)) +
    chalk.white(" │ ") +
    chalk.magenta(code.padEnd(28)) +
    chalk.cyan("│")
  )

  console.log(chalk.cyan(`└${line}┘`))
}

export { printPairingBox }