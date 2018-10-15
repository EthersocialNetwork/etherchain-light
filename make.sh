#!/bin/bash

date
svn update
forever cleanlogs
forever restart 0
forever logs 0 -f
