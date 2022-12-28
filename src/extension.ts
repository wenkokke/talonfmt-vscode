import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import * as child_process from 'child_process'
import * as tmp from 'tmp'
import * as fs from 'fs'

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const commandExists = require('command-exists').sync

const exeName = 'talonfmt'

export function activate(_context: vscode.ExtensionContext): void {
  vscode.languages.registerDocumentFormattingEditProvider(
    'talon',
    new TalonFormatProvider()
  )
}

function findManual(): string | null {
  let talonfmtPath = vscode.workspace.getConfiguration('talonfmt').path
  if (talonfmtPath === '') {
    return null
  }
  talonfmtPath = talonfmtPath
    .replace('${HOME}', os.homedir)
    .replace('${home}', os.homedir)
    .replace(/^~/, os.homedir)

  if (!commandExists(talonfmtPath)) {
    vscode.window.showErrorMessage(
      `Path to talonfmt is set to an unknown place: ${talonfmtPath}`
    )
    throw new Error(`Unable to find ${talonfmtPath}`)
  }
  return talonfmtPath
}

function findLocal(): string | null {
  if (commandExists(exeName)) {
    return exeName
  }
  return null
}

async function talonfmt(
  filePath: string,
  nominalPath: string
): Promise<string> {
  return new Promise((resolve, rejects) => {
    const talonfmtPath = findManual() ?? findLocal()
    if (talonfmtPath === null) {
      vscode.window.showErrorMessage(`Path to talonfmt is null`)
      rejects('Unable to call talonfmt')
    } else {
      const indent = vscode.workspace.getConfiguration('talonfmt').indent
      const cmd = child_process.spawn(talonfmtPath, [
        `--indent-size=${indent}`,
        filePath
      ])
      const result: Buffer[] = []
      const err: Buffer[] = []
      cmd.stdout.on('data', data => {
        result.push(Buffer.from(data))
      })
      cmd.stderr.on('data', data => {
        err.push(Buffer.from(data))
      })
      cmd.on('exit', _exitCode => {
        const output = Buffer.concat(result).toString()
        const errorMessage = Buffer.concat(err)
          .toString()
          .replace(new RegExp(filePath, 'g'), path.basename(nominalPath))
        if (output.length > 0) {
          resolve(output)
        } else {
          vscode.window.showErrorMessage(`talonfmt: ${errorMessage}`)
          rejects(Error(errorMessage))
        }
      })
      cmd.on('error', error => {
        vscode.window.showErrorMessage(
          `Failed to call talonfmt: ${error.message}`
        )
        rejects(error)
      })
    }
  })
}

class TalonFormatProvider implements vscode.DocumentFormattingEditProvider {
  async provideDocumentFormattingEdits(
    document: vscode.TextDocument
  ): Promise<vscode.TextEdit[]> {
    return new Promise((resolve, rejects) => {
      tmp.file(
        {prefix: '.talonfmt', tmpdir: path.dirname(document.fileName)},
        async function _tempFileCreated(tmpErr, tmpPath, _fd, cleanupCallback) {
          if (tmpErr) {
            throw tmpErr
          }
          fs.writeFileSync(tmpPath, document.getText())
          vscode.window.showInformationMessage(
            `Formatting ${path.basename(document.fileName)}`
          )
          try {
            const result = await talonfmt(tmpPath, document.fileName)
            const range = document.validateRange(
              new vscode.Range(0, 0, Infinity, Infinity)
            )
            resolve([new vscode.TextEdit(range, result)])
          } catch (error) {
            rejects(error)
          } finally {
            cleanupCallback()
          }
        }
      )
    })
  }
}
