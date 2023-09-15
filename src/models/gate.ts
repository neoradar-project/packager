import { geoHelper } from "../libs/geo-helper.js"

export class Gate {

    name!: string
    latitute!: number
    longitude!: number
    priority = 0
    icao: string = ""
    sourceId: string = ""
    type: string = "gate"

    //https://www.skybrary.aero/articles/icao-aerodrome-reference-code
    code: string = "Z"
    maxWingSpan = 40
    layerUniqueId: number = 0

    constructor(data: any) {
        Object.assign(this, data)
    }

    public toJsonObject(): any {
        return {
            name: this.name,
            icao: this.icao,
            lat: this.latitute,
            lon: this.longitude,
            code: this.code,
            maxWingSpan: this.maxWingSpan,
            priority: this.priority,
            layerUniqueId: this.layerUniqueId
        }
    }

    static init(line: string): Gate | null {
        const data = line.split(":").filter((item) => item !== "")
        if (data.length >= 4) {
            const geo = geoHelper.convertESEGeoCoordinates(data[0], data[1])
            if(!geo) return null
            const gate = new Gate({
                name: data[3].replace("\r", ""),
                latitute: geo.lat,
                longitude: geo.lon
            })
            if (data.length === 5) {
                gate.code = data[4].replace("\r", "")
                const c = gateCodesData[gate.code]
                if (c) {
                    gate.maxWingSpan = Number(c.maxWingSpan)
                }
            }
            if(data.length === 6) {
                gate.priority = Number(data[5])
            }
            return gate
        }
        return null
    }
}

export const gateCodesData: { [key: string]: any } = {
    A: {
        code: "A",
        minWingSpan: 0,
        maxWingSpan: 15,
        aircraftTypes: "AC11,AC50,AC56,AC68,AC6L,AEST,BE10,BE23,BE33,BE35,BE36,BE40,BE50,BE55,BE58,BE60,BE76,BE95,BE99,BE9L,BN2T,C06T,C150,C152,C172,C177,C182,C206,C207,C208,C210,C25A,C25B,C25C,C303,C310,C337,C340,C402,C404,C414,C421,C425,C441,C510,C525,C550,C560,C82R,COY2,CP23,DA40,DA42,DA50,DA62,DR40,E110,E121,E50P,ERCO,F26T,F406,FA10,H25A,H25C,HDJT,JS1,JS20,JS3,JS31,JS32,K100,LJ25,LJ31,LJ35,LJ40,LJ45,LJ55,LJ60,M20P,M20T,MU2,P180,P28A,P28R,P28T,P32R,P46T,P808,PA23,PA27,PA31,PA32,PA34,PA38,PA44,PA46,PAY2,PAY3,PAY4,PC21,PC6T,PC7,PC9,PRM1,RALL,RV10,RV12,RV14,RV15,RV3,RV4,RV4T,RV6,RV7,RV8,RV9,S05F,S05R,S601,SBR2,SC7,SF50,SR20,SR22,SW2,SW3,TAMP,TB30,TBM7,TBM8,TBM9,TOBA,TRIN,TUCA"
    },
    B: {
        code: "B",
        minWingSpan: 15,
        maxWingSpan: 24,
        aircraftTypes: "AC95,AN28,AN38,ASTR,AT43,AT44,AT45,AT46,B190,B350,BE20,BE70,BE80,C212,C56X,C650,C680,C700,C750,CL30,CL35,CL60,CRJ1,CRJ2,CRJ5,CRJ7,D228,D328,DHC6,E120,E135,E145,E2,E55P,F2TH,F900,FA20,FA50,G150,G280,GALX,GLF3,GLF4,H25B,J328,JS41,L10,L29B,L410,N262,PC12,SB20,SF34,SH33,SH36,SW4,YK40"
    },
    C: {
        code: "C",
        minWingSpan: 24,
        maxWingSpan: 36,
        aircraftTypes: "A19N,A20N,A21N,A318,A319,A320,A321,A748,AN24,AN26,AN30,AN32,AN72,AT72,AT73,AT75,AT76,ATP,B37M,B38M,B39M,B3XM,B461,B462,B463,B712,B722,B731,B732,B733,B734,B735,B736,B737,B738,B739,BA11,BCS1,BCS3,C2,CL2T,CN35,CRJ9,CRJX,DC3,DC3S,DC3T,DC4,DC6,DC91,DC92,DC93,DC94,DC95,DH8A,DH8B,DH8C,DH8D,DHC5,DHC7,E170,E190,E195,F100,F27,F28,F50,F70,FA5X,FA6X,FA7X,FA8X,FA9X,G222,GL5T,GLEX,GLF5,L188,L610,MD81,MD82,MD83,MD87,MD88,MD90,P3,RJ1H,RJ70,RJ85,SU95,T134,YK42"
    },
    D: {
        code: "D",
        minWingSpan: 36,
        maxWingSpan: 52,
        aircraftTypes: "A306,A30B,A310,A3ST,A400,AN12,AN70,B701,B703,B720,B752,B753,B762,B763,B764,C130,C135,C141,C160,C17,C30J,CONI,DC10,DC7,DC85,DC86,DC87,E3CF,E3TF,IL18,IL62,IL76,IL86,K35E,K35R,L101,MD11,R135,T154,T204,VC10"
    },
    E: {
        code: "E",
        minWingSpan: 52,
        maxWingSpan: 65,
        aircraftTypes: "A332,A333,A338,A339,A342,A343,A345,A346,A359,A35K,AN22,B741,B742,B743,B744,B74D,B74R,B74S,B772,B773,B778,B779,B77L,B77W,B788,B789,B78X,CONC,IL96"
    },
    F: {
        code: "F",
        minWingSpan: 65,
        maxWingSpan: 80,
        aircraftTypes: "A124,A388,B748,C5"
    },
    G: {
        code: "G",
        minWingSpan: 80,
        maxWingSpan: 90,
        aircraftTypes: "A225"
    }
}
