import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import * as child_process from 'child_process'
import * as tmp from 'tmp'
import * as fs from 'fs'
import commandExists from 'command-exists'

const exeName = 'talonfmt'

export function activate(_context: vscode.ExtensionContext): void {
  vscode.languages.registerDocumentFormattingEditProvider(
    'talon',
    new TalonFormatProvider()
  )
}

async function findExe(): Promise<string | null> {
  // Try the path from the extension settings:
  let talonfmtPath = vscode.workspace.getConfiguration('talonfmt').path
  if (talonfmtPath !== '') {
    talonfmtPath = talonfmtPath
      .replace('${HOME}', os.homedir)
      .replace('${home}', os.homedir)
      .replace(/^~/, os.homedir)
    const talonfmtExists = await commandExists(talonfmtPath)
    if (!talonfmtExists) {
      vscode.window.showErrorMessage(
        `Path to talonfmt is set to an unknown place: ${talonfmtPath}`
      )
      throw new Error(`Unable to find ${talonfmtPath}`)
    }
    return talonfmtPath
  } else {
    const talonfmtExists = await commandExists(exeName)
    return talonfmtExists ? exeName : null
  }
}

async function talonfmt(
  filePath: string,
  nominalPath: string
): Promise<string> {
  return new Promise(async (resolve, rejects) => {
    const talonfmtPath = await findExe()
    if (talonfmtPath === null) {
      vscode.window.showErrorMessage(`Path to talonfmt is null`)
      rejects('Unable to call talonfmt')
    } else {
      const indentSize =
        vscode.workspace.getConfiguration('talonfmt')['indent-size']
      const cmd = child_process.spawn(talonfmtPath, [
        `--indent-size=${indentSize}`,
        filePath
      ])
      const result: Buffer[] = []
      const err: Buffer[] = []
      cmd.stdout.on('data', data => result.push(Buffer.from(data)))
      cmd.stderr.on('data', data => err.push(Buffer.from(data)))
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
          if (tmpErr) throw tmpErr
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
