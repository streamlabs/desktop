const fs = require('fs');
const CONFIG = JSON.parse(fs.readFileSync('test/screentest/config.json'));
const CONFIG_VARIATION = CONFIG.configs;

export function getConfig() {
  return JSON.parse(fs.readFileSync('test/screentest/config.json'));
}

/**
 * get set of unique configs
 */
export function getConfigsVariations() {
  const configKeys = Object.keys(CONFIG_VARIATION);
  let configs: Dictionary<any>[] = [];

  configKeys.forEach(configKey => {
    const configParam = CONFIG_VARIATION[configKey];

    const options = configParam.options;
    const updatedConfigs: Dictionary<any>[] = [];
    options.forEach((value: any) => {
      if (!configs.length) {
        updatedConfigs.push({ [configKey]: value });
      } else {
        configs.forEach(config => {
          updatedConfigs.push(Object.assign({}, config, { [configKey]: value }));
        });
      }
    });
    configs = updatedConfigs;
  });
  return configs;
}
