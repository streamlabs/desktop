
# To update our forks electron version. 

## Prepare electron source 
Get source and update it with commands
```
git clone https://github.com/streamlabs/electron.git
cd electron 
git checkout sl_2-0-x
git remote add upstream https://github.com/electron/electron.git
git fetch upstream
git merge upstream/2-0-x
git push origin
```

Change version name to not get mixed in caches with original version files. from `2.0.16` to `2.0.16-streamlabs`

In package.json line with `"version":`

in electron.gyp line with `'version%'`

## Build release package 
Build new release package with commands: 
```
python script\bootstrap.py -v
python script\build.py
python script\create-dist.py
node script\prepare_fork_build.js
```

First 3 command from official build instruction `https://github.com/electron/electron/blob/2-0-x/docs/development/build-instructions-windows.md`

Last command print in log paths to tar.gz zip and sha256 files what need to be uploaded to github as relase 

Do not commit changes in electron.gyp and package.json if you do not want manualy merge next time. 

## Upload files to github 
* Go to `https://github.com/streamlabs/electron/releases`
* Create new release with save version as set in `package.json` - `2.0.16-streamlabs`
* upload tgz package file 
* upload relese zip file 
* upload SHASUMS256 file 
* publish release 
* get url of uploaded package file 

## Update version in slobs 
* go to slobs source 
* checkout branch with electron fork `electron_fork_browserviews`
* in `package.json` replace electron prev version with url of tgz package from github 
