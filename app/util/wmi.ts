import * as cp from 'child_process';

export function getWmiClass(wmiClass: string, select: string[]): object {
  try {
    const result = JSON.parse(
      cp
        .execSync(
          `Powershell -command "Get-CimInstance -ClassName ${wmiClass} | Select-Object ${select.join(
            ', ',
          )} | ConvertTo-JSON"`,
        )
        .toString(),
    );

    if (Array.isArray(result)) {
      return result.map(o => convertWmiValues(o));
    } else {
      return convertWmiValues(result);
    }
  } catch (e: unknown) {
    console.error(`Error fetching WMI class ${wmiClass} for diagnostics`, e);
    return [];
  }
}

function convertWmiValues(wmiObject: Dictionary<any>) {
  Object.keys(wmiObject).forEach(key => {
    const val = wmiObject[key];

    if (typeof val === 'string') {
      const match = val.match(/\/Date\((\d+)\)/);

      if (match) {
        wmiObject[key] = new Date(parseInt(match[1], 10)).toString();
      }
    }
  });

  return wmiObject;
}
