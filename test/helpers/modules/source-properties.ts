// Framework-agnostic helpers for testing the Source Properties window.
// They only use the external API and framework-neutral DOM hooks, so they keep working
// when the window moves from Vue to React.
import { getApiClient } from '../api-client';
import { SourcesService } from '../../../app/services/api/external-api/sources';
import { closeWindow, focusChild, focusMain, waitForDisplayed } from './core';
import { addSource } from './sources';
import { useForm } from './forms';

export interface IFormProp {
  name: string;
  type: string;
  description: string;
  value: any;
  visible: boolean;
  enabled: boolean;
  options?: { value: any; description: string }[];
  [key: string]: any;
}

/**
 * Resolves the sources service proxy. Awaiting a proxy invokes `then` on it and the API answers
 * METHOD_NOT_FOUND, so use it as `const sources = (await getSourcesService()).service`.
 */
async function getSourcesService() {
  const api = await getApiClient();
  return { service: api.getResource<SourcesService>('SourcesService') };
}

/**
 * Never return an API proxy out of an async function: awaiting it invokes `then` on the proxy.
 * All helpers below return plain data.
 */
export async function getSourceId(sourceName: string): Promise<string> {
  const { service: sources } = await getSourcesService();
  return sources.getSourcesByName(sourceName)[0].sourceId;
}

export async function getSourceType(sourceName: string): Promise<string> {
  const { service: sources } = await getSourcesService();
  return sources.getSourcesByName(sourceName)[0].type;
}

export async function getSourceSettings(sourceName: string): Promise<Dictionary<any>> {
  const { service: sources } = await getSourcesService();
  return sources.getSourcesByName(sourceName)[0].getSettings();
}

export async function getSourceFormProps(sourceName: string): Promise<IFormProp[]> {
  const { service: sources } = await getSourcesService();
  return (sources
    .getSourcesByName(sourceName)[0]
    .getPropertiesFormData() as unknown) as IFormProp[];
}

/**
 * Returns a map of OBS property name -> current value
 */
export async function getSourceFormValues(sourceName: string): Promise<Dictionary<any>> {
  const props = await getSourceFormProps(sourceName);
  const result: Dictionary<any> = {};
  props.forEach(p => (result[p.name] = p.value));
  return result;
}

export async function getSourceFormProp(sourceName: string, propName: string): Promise<IFormProp> {
  const props = await getSourceFormProps(sourceName);
  const prop = props.find(p => p.name === propName);
  if (!prop) throw new Error(`Property "${propName}" not found in source "${sourceName}"`);
  return prop;
}

/**
 * Sets OBS property values straight through the API (bypassing the UI)
 */
export async function setSourceFormValues(sourceName: string, values: Dictionary<any>) {
  const { service: sources } = await getSourcesService();
  const source = sources.getSourcesByName(sourceName)[0];
  const props = (source.getPropertiesFormData() as unknown) as IFormProp[];
  for (const key of Object.keys(values)) {
    const prop = props.find(p => p.name === key);
    if (!prop) throw new Error(`Property "${key}" not found in source "${sourceName}"`);
    prop.value = values[key];
  }
  source.setPropertiesFormData(props as any);
}

/**
 * Adds a source through the UI and returns once it exists. Source Properties is closed.
 */
export async function addTestSource(type: string, name: string) {
  await addSource(type, name);
  await focusMain();
}

/**
 * Opens the Source Properties window through the sources service and focuses it.
 * Waits for the first visible property label to be rendered.
 */
export async function openProperties(sourceName: string) {
  const { service: sources } = await getSourcesService();
  const source = sources.getSourcesByName(sourceName)[0];
  const id = source.sourceId;
  const props = (source.getPropertiesFormData() as unknown) as IFormProp[];
  // FONT is rendered as several controls, its description is not a label
  const firstVisible = props.find(
    p => p.visible && p.description && p.type !== 'OBS_PROPERTY_FONT',
  );
  sources.showSourceProperties(id);
  await focusChild();
  if (firstVisible) {
    await waitForDisplayed(`label=${firstVisible.description}`, { timeout: 15000 });
  }
}

export async function closeProperties() {
  await closeWindow('child');
  await focusMain();
}

/**
 * Reads the UI fields of the open properties window as `{ [data-name]: displayValue }`
 */
export async function readPropertiesUi() {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useForm().readFields();
}
