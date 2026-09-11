/**
 * This script adds some customization code for the typedoc generated documentation
 */


document.addEventListener('DOMContentLoaded', () => {

  // simplify the generated page by removing useless html blocks

  // constructors are useless for API docs
  removeConstructors();

  // hide file exports from navigation
  hideExports();

  // hide breadcrumbs from navigation
  hideBreadcrumbs();

  // hide hierarchy for classes and interfaces without inheritance
  hideHierarchyBlock();

  // hide filters for the search bar
  hideFilers();

  // remove unused legends
  patchLegend();

  // show only classes in the nav menu
  hideNonClassesFromNavigation();

  console.log('monkeypatch applied');
});


function hideHierarchyBlock() {
  var $hierarchy = document.querySelector('.tsd-panel.tsd-hierarchy');
  if (!$hierarchy) return;

  var hierarchySize = $hierarchy.querySelectorAll('ul').length;

  // hide hierarchy if only one element presents
  if (hierarchySize <= 1) {
    $hierarchy.style.display = 'none';
  }
}

function patchLegend() {
  // hide unrelated legend
  const allowlist = [
    'Type alias',
    'Enumeration',
    'Enumeration member',
    'Interface',
    'Interface with type parameter',
    'Property',
    'Method',
    'Index signature',
    'Class'
  ];

  document.querySelectorAll('.tsd-legend span').forEach(legend => {
    if (!allowlist.includes(legend.innerHTML)) {
      legend.parentElement.style.display = 'none';
    }
  });

}


function hideBreadcrumbs() {
  const $breadCrumbs = document.querySelector('.tsd-breadcrumb');
  if ($breadCrumbs) $breadCrumbs.remove();
}

function hideExports() {
  document.querySelector('.tsd-navigation.primary').remove();
}

function removeConstructors() {
  // remove the constructor link from the index
  document.querySelectorAll('.tsd-index-section h3').forEach($h3 => {
    if ($h3.innerHTML === 'Constructors') $h3.parentElement.remove();
  });

  // remove the constructor block
  document
    .querySelectorAll('section.tsd-kind-constructor')
    .forEach(el => el.parentElement.remove());
}

function hideFilers() {
  document.querySelector('.tsd-filter-group').remove();
}

function hideNonClassesFromNavigation() {
  document
    .querySelectorAll('.tsd-navigation.secondary li:not(.tsd-kind-class)')
    .forEach(el => el.remove());
}
