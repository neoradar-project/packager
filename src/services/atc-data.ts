import debug from 'debug'
import { system } from './system.js'
import { gateCodesData } from '../models/gate.js'
import { recatDefinition } from '../models/recatDef.model.js'
const log = debug('AtcDataManager')

class AtcDataManager {

    constructor() {
    }

    public async generateAtcdata(
        packageId: string,
        loginProfilesFile: string,
        icaoAircraftPath: string,
        icaoAirlinesPath: string,
        recatDefinitionPath: string | undefined,
        aliasPath: string,
        outputPath: string
    ): Promise<void> {
        log('generateAtcData', packageId, loginProfilesFile)
        let actData: any = {}

        actData.loginProfiles = await this.parseLoginProfiles(loginProfilesFile)
        actData.icaoAircraft = await this.parseIcaoAircraft(icaoAircraftPath, recatDefinitionPath)
        actData.icaoAirlines = await this.parseIcaoAirline(icaoAirlinesPath)
        actData.alias = await this.parseAlias(aliasPath)


        await system.writeFile(`${outputPath}/${packageId}/datasets/atc-data.json`, JSON.stringify(actData))
    }

    private async parseLoginProfiles(loginProfilesFile: string): Promise<any> {
        const profiles = await system.readFile(loginProfilesFile)
        const lines = profiles.toString().split("\n")

        const data = {}
        let currentProfile = ""
        for (const line of lines) {
            if (line.startsWith("PROFILE:")) {
                const elements = line.split(":")
                currentProfile = elements[1]
                data[currentProfile] = {
                    callsign: elements[1],
                    range: Number(elements[2]),
                    facility: Number(elements[3])
                }
                continue
            }
            if (line.startsWith("ATIS")) {
                const elements = line.split(":")
                const atisLineNum = Number(elements[0]?.substring(4))
                data[currentProfile][`atisLine${atisLineNum}`] = elements[1]
            }
        }

        return data

    }

    private async parseIcaoAirline(icaoAirlinesPath: string): Promise<any> {
        const profiles = await system.readFile(icaoAirlinesPath)
        const lines = profiles.toString().split("\n")
        const data = {}
        for (const line of lines) {
            if (line.startsWith(";")) {
                continue
            }
            const parts = line.split("\t")
            if(parts.length < 4) {
                continue
            }
            const obj = {
                icao: parts[0],
                name: parts[1],
                callsign: parts[2],
                country: parts[3].replace('\r', ''),
            }
            data[obj.icao] = obj
        }

        return data
    }

    private async parseIcaoAircraft(icaoAircraftPath: string, recatDefinitionPath: string | undefined): Promise<any> {
        const profiles = await system.readFile(icaoAircraftPath)
        let recatDef: recatDefinition[] | undefined = undefined;
        if (recatDefinitionPath) {
            const recatData = await system.readFile(recatDefinitionPath);  
            recatDef = JSON.parse(recatData) as recatDefinition[];     
        }
        const lines = profiles.toString().split("\n")
        const data = {}
        for (const line of lines) {
            if (line.startsWith(";")) {
                continue
            }
            const parts = line.split("\t")
            if(parts.length < 4) {
                continue
            }
            let maxWingSpan = 0
            for(const gateCode of Object.values(gateCodesData)) {
                if(gateCode.aircraftTypes.includes(parts[0])) {
                    maxWingSpan = gateCode.maxWingSpan
                    break
                }
            }
            const engines = parts[1].slice(1,);
            const wakeCat = parts[1].charAt(0);
            const icao = parts[0];
            let recat = "";
            if (recatDef) {
                recat = recatDef.find(rd => rd.icao === icao)?.categoryLabel || '';
            }
            const obj = {
                icao: icao,
                engines: engines,
                builder: parts[2],
                wakeCat: wakeCat,
                recatCat: recat,
                name: parts[3].replace('\r', ''),
                maxWingSpan: maxWingSpan
            }
            data[obj.icao] = obj
        }

        return data
    }

    private async parseAlias(aliasPath: string): Promise<any> {
        const profiles = await system.readFile(aliasPath)
        const lines = profiles.toString().split("\n")
        const data: { [key: string]: string } = {};
        for (const line of lines) {
            if (line.startsWith(";") || line.startsWith(" ")) {
                continue
            }
            if(line.length > 0) {
                const ref = line.split(" ")[0].trim()
                data[ref.replace('.', '')] = line.replace(ref, '').trim()
            }
        }
        return data
    }
}

export const atcData = new AtcDataManager()
