import csv
import json

recatInJson = []

existingIcaos = []

with open('recat_raw.csv') as csvfile:
    reader = csv.DictReader(csvfile)
    for row in reader:
        if ('icao' not in row.keys() or 'recatCat' not in row.keys()):
            continue

        if (not row['icao'] or not row['recatCat']):
            continue

        if (len(row['icao']) == 0 or len(row['recatCat']) == 0):
            continue

        if (row['icao'] in existingIcaos):
            continue

        existingIcaos.append(row['icao'])

        recatInJson.append({
            'icao': row['icao'].strip(),
            'categoryLabel': row['recatCat'].replace('CAT-', '').strip()
        })


print(json.dumps(recatInJson))