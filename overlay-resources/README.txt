Default Scene Collection Override
=================================

To override the default scene collection that Streamlabs Desktop installs
on app start (when not logged in) and on user login, drop the overlay file
and its assets into this directory.

How it works
------------
On startup and on login, Streamlabs Desktop looks here for a `.overlay`
file. If one is present and loads successfully, it is installed as the
default scene collection in place of downloading the built-in default
from the network. If no `.overlay` file is present, or if loading the
local file fails for any reason, the application falls back to
downloading the default overlay from the configured URL.

What to put here
----------------
- One `.overlay` file (a zip archive containing `config.json` plus its
  bundled assets). If multiple `.overlay` files are present, the first
  one returned by the filesystem is used.
- Any loose asset files referenced from inside the `.overlay` archive
  may also be placed alongside it, but assets bundled inside the
  `.overlay` archive itself are sufficient on their own.

Changing the scene collection's name
------------------------------------
Put the name on the first line of a file called `overlay-name.txt` in
this directory. The default overlay is installed under that name, and
the app finds it again by that name on later starts. If the file is
missing or its first line is empty, the name built into the app is used.

Set the name before the app first runs. Changing it afterwards makes the
app install the overlay again under the new name, leaving the collection
with the old name in place.

Notes
-----
- This directory is `<install-root>/resources/overlay/` in a packaged
  build, and `<repo>/overlay-resources/` when running from source.
- This `README.txt` file is ignored by the install logic. Only files
  ending in `.overlay`, and `overlay-name.txt`, are read.
