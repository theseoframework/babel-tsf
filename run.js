// USAGE:
// 1. Terminal -> New Terminal (CTRL+SHIFT+`)
// 2. Enter: npm start
// 3. Open your browser, and go to go to: localhost:8000/?file=C:\path\to\file.js
// 4. The response will be the minified file.
//
// FOLDER MINIFICATION:
// Go to: localhost:8000/?folder=C:\path\to\folder
// This will find all .js files (excluding .min.js) and create .min.js versions.

const babel = require( '@babel/core' );
const http  = require( 'http' );
const url   = require( 'url' );
const fs    = require( 'fs' );
const path  = require( 'path' );
const port  = 8000;

console.log( 'Server started. Listening...' );
console.log( `Go to: localhost:${port}/?file=C:\\path\\to\\file.js` );
console.log( `Or:    localhost:${port}/?folder=C:\\path\\to\\folder` );

const getMinifyOptions = () => ({
	presets: [
		[
			"minify",
			{
				regexpConstructors: false,
				evaluate: false,
				removeConsole: true,
				removeDebugger: true,
			}
		],
	],
	plugins: [
		() => ( {
			visitor: {
				TemplateLiteral( path ) {
					path.node.quasis.forEach( ( quasi, index, arr ) => {
						const isFirst = index === 0;
						const isLast  = index === arr.length - 1;

						let raw    = quasi.value.raw;
						let cooked = quasi.value.cooked;

						// Trim whitespace at the end (before ${) only if it contains newlines/tabs
						if ( ! isLast ) {
							raw    = raw.replace( /\s*[\r\n\t]\s*$/, '' );
							cooked = cooked.replace( /\s*[\r\n\t]\s*$/, '' );
						}

						// Trim whitespace at the start (after }) only if it contains newlines/tabs
						if ( ! isFirst ) {
							raw    = raw.replace( /^\s*[\r\n\t]\s*/, '' );
							cooked = cooked.replace( /^\s*[\r\n\t]\s*/, '' );
						}

						// Collapse remaining internal whitespace to single spaces
						raw    = raw.replace( /\s+/g, ' ' );
						cooked = cooked.replace( /\s+/g, ' ' );

						quasi.value.raw    = raw;
						quasi.value.cooked = cooked;
					} );
				},
			},
		} ),
	],
	comments: false,
	babelrc: false,
	configFile: false,
});

const writeConversion = filename => new Promise( ( _resolve, _reject ) => {

	console.log( 'Working on ' + filename );

	const options = getMinifyOptions();

	babel.transformFileAsync( filename, options ).then( result => {
		_resolve( result.code );
	} ).catch( err => {
		console.log( 'Encountered error transforming...' );
		console.log( 'Error details:' );
		console.log( 'Message:', err.message );
		console.log( 'Stack:', err.stack );
		console.log( 'Code:', err.code );
		console.log( 'Full error object:', err );
		_reject( err );
	} );
} );

const minifyAndWriteFile = async ( filePath ) => {
	const minifiedPath = filePath.replace( /\.js$/, '.min.js' );
	console.log( `Minifying: ${filePath} -> ${minifiedPath}` );

	try {
		const code = await writeConversion( filePath );
		await fs.promises.writeFile( minifiedPath, code + '\n', 'utf8' );
		return { success: true, source: filePath, output: minifiedPath };
	} catch ( err ) {
		return { success: false, source: filePath, error: err.message };
	}
};

const minifyFolder = async ( folderPath ) => {
	const results = [];

	const processDirectory = async ( dirPath ) => {
		const entries = await fs.promises.readdir( dirPath, { withFileTypes: true } );

		for ( const entry of entries ) {
			const fullPath = path.join( dirPath, entry.name );

			if ( entry.isDirectory() ) {
				await processDirectory( fullPath );
			} else if ( entry.isFile() && entry.name.endsWith( '.js' ) && ! entry.name.endsWith( '.min.js' ) ) {
				const result = await minifyAndWriteFile( fullPath );
				results.push( result );
			}
		}
	};

	await processDirectory( folderPath );
	return results;
};

http.createServer( ( req, res ) => {
	var queryData = url.parse(req.url, true).query;
	console.log( 'Received request...' );
	res.writeHead( 200, {"Content-Type": "text/plain"} );
	if ( queryData.folder ) {
		minifyFolder( queryData.folder ).then( results => {
			const succeeded = results.filter( r => r.success );
			const failed = results.filter( r => ! r.success );

			res.write( `=== FOLDER MINIFICATION COMPLETE ===\n\n` );
			res.write( `Processed: ${results.length} files\n` );
			res.write( `Succeeded: ${succeeded.length}\n` );
			res.write( `Failed: ${failed.length}\n\n` );

			if ( succeeded.length > 0 ) {
				res.write( `--- SUCCEEDED ---\n` );
				succeeded.forEach( r => {
					res.write( `${r.source} -> ${r.output}\n` );
				} );
				res.write( `\n` );
			}

			if ( failed.length > 0 ) {
				res.write( `--- FAILED ---\n` );
				failed.forEach( r => {
					res.write( `${r.source}: ${r.error}\n` );
				} );
			}
		} ).catch( err => {
			res.write( '---ERROR  \n\n\n' );
			res.write( err.toString() );
		} ).finally( () => {
			res.end();
			console.log( 'Sent response.' );
		} );
	} else if ( queryData.file ) {
		writeConversion( queryData.file ).then( content => {
			res.write( content );
		} ).catch( err => {
			res.write( '---ERROR  \n\n\n' );
			if ( err ) {
				res.write( err.toString() );
			} else {
				res.write( '...No usable error was specified...' );
			}
		} ).finally( () => {
			res.end();
			console.log( 'Sent response.' );
		});
	} else {
		res.write( 'Specify the file: ?file=C:\\path\\to\\file.js\n' );
		res.write( 'Or minify folder: ?folder=C:\\path\\to\\folder' );
		res.end();
		console.log( 'Sent response.' );
	}
} ).listen( port );
