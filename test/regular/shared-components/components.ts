import { test, useWebdriver } from '../../helpers/webdriver';
import { showSettingsWindow } from '../../helpers/modules/settings/settings';
import { clickButton, clickTab, focusChild } from '../../helpers/modules/core';
import { useForm } from '../../helpers/modules/forms';
useWebdriver();

/**
 * Test shared input components
 */
test('Form inputs', async t => {
  const { readForm, fillForm, assertFormContains } = useForm('demo-form');

  // open demo-form
  await showSettingsWindow('Experimental');
  await clickButton('Show Shared Components Library');
  await clickTab('Demo Form');

  // test that we can read the form data correctly
  const initialFormData = await readForm();

  t.deepEqual(initialFormData, [
    { name: 'name', title: 'Name', value: '', displayValue: '' },
    { name: 'gender', title: 'Gender', value: '', displayValue: null },
    { name: 'age', title: 'Age', value: '0', displayValue: '0' },
    { name: 'city', title: 'City', value: '', displayValue: null },
    { name: 'weight', title: 'Weight', value: 65, displayValue: 65 },
    { name: 'colors', title: 'Pick your favorite colors', value: [], displayValue: [] },
    { name: 'saveFilePath', title: 'Save to File', value: '', displayValue: '' },
    { name: 'addIntroduction', title: 'Add Introduction', value: false, displayValue: false },
    {
      name: 'confirm1',
      title: 'Confirm you allow processing your data',
      value: false,
      displayValue: false,
    },
    {
      name: 'confirm2',
      title: 'Confirm you love Streamlabs',
      value: false,
      displayValue: false,
    },
  ]);

  // fill out all inputs
  await fillForm({
    name: 'John Doe',
    gender: 'Male',
    colors: ['Red', 'Orange'],
    age: 20,
    weight: 100,
    city: 'Cairo',
    addIntroduction: true,
    introduction: 'Hello World!',
    saveFilePath: 'C:\\myreport.txt',
    confirm1: true,
    confirm2: true,
  });

  // read the form again and test that it was filled out correctly
  const filledFormData = await readForm();

  t.deepEqual(filledFormData, [
    { name: 'name', title: 'Name', value: 'John Doe', displayValue: 'John Doe' },
    { name: 'gender', title: 'Gender', value: 'male', displayValue: 'Male' },
    { name: 'age', title: 'Age', value: '20', displayValue: '20' },
    { name: 'city', title: 'City', value: 'Cairo', displayValue: 'Cairo' },
    { name: 'weight', title: 'Weight', value: 100, displayValue: 100 },
    {
      name: 'colors',
      title: 'Pick your favorite colors',

      value: [1, 4],
      displayValue: ['Red', 'Orange'],
    },
    {
      name: 'saveFilePath',
      title: 'Save to File',
      value: 'C:\\myreport.txt',
      displayValue: 'C:\\myreport.txt',
    },
    { name: 'addIntroduction', title: 'Add Introduction', value: true, displayValue: true },
    {
      name: 'introduction',
      title: 'Introduction',
      value: 'Hello World!',
      displayValue: 'Hello World!',
    },
    {
      name: 'confirm1',
      title: 'Confirm you allow processing your data',
      value: true,
      displayValue: true,
    },
    { name: 'confirm2', title: 'Confirm you love Streamlabs', value: true, displayValue: true },
  ]);

  // test assertion
  await assertFormContains({
    name: 'John Doe',
    gender: 'Male',
    colors: ['Red', 'Orange'],
    age: 20,
    city: 'Cairo',
    weight: 100,
    addIntroduction: true,
    introduction: 'Hello World!',
    saveFilePath: 'C:\\myreport.txt',
    confirm1: true,
    confirm2: true,
  });
});
