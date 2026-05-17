import logger from '../utils/logger.js';

const errorMiddleware = (err, req, res, next) => {
	logger.error(err.message, err.stack);

	if (res.headersSent) {
		return next(err);
	}

	const status = err.status || 500;
	res.status(status).json({
		success: false,
		error: err.publicMessage || 'Technischer Fehler. Bitte später erneut versuchen.',
		errorCode: err.code || 'technical_error',
	});
};

export default errorMiddleware;
export { errorMiddleware };
