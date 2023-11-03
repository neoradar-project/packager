import Debug from "debug"
const debug = Debug("MainServer")
import { packageBuilder } from "./services/package-builder.js"
import { system } from "./services/system.js"
import { InputManifest } from "./models/inputManifest.model.js"

async function startJobs() {
  debug("Starting !")
  const inputFilePath = process.argv[2]
  console.log("Input file path: ", inputFilePath)
  const data = JSON.parse(await system.readFile(inputFilePath)) as InputManifest
  console.log("Data: ", data)

  await packageBuilder.build(
    data.id,
    data.name,
    data.description,
    data.namespace,
    data.sctPath,
    data.esePath,
    data.loginProfilesPath,
    data.icaoAircraftPath,
    data.icaoAirlinesPath,
    data.recatDefinitionPath,
    data.aliasPath,
    data.outputDir
  )
}


startJobs()
