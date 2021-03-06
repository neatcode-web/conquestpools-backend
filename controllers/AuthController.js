const { getConnection, sql } = require("../database/connection");
const { querys } =  require("../database/querys");
const { body,validationResult } = require("express-validator");
const { sanitizeBody } = require("express-validator");
//helper file to prepare responses.
const apiResponse = require("../helpers/apiResponse");
const utility = require("../helpers/utility");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const mailer = require("../helpers/mailer");
const { constants } = require("../helpers/constants");

/**
 * User registration.
 *
 * @param {string}      firstName
 * @param {string}      lastName
 * @param {string}      email
 * @param {string}      password
 *
 * @returns {Object}
 */
exports.register = [
	// Validate fields.
	body("username").isLength({ min: 1 }).trim().withMessage("Username must be specified."),
	body("password").isLength({ min: 6 }).trim().withMessage("Password must be 6 characters or greater."),
	// Sanitize fields.
	sanitizeBody("username").escape(),
	sanitizeBody("password").escape(),
	// Process request after validation and sanitization.
	(req, res) => {
		try {
			// Extract the validation errors from a request.
			const errors = validationResult(req);
			if (!errors.isEmpty()) {
				// Display sanitized values/errors messages.
				return apiResponse.validationErrorWithData(res, "Validation Error.", errors.array());
			}else {
				//hash input password
				bcrypt.hash(req.body.password,10,function(err, hash) {
					// generate OTP for confirmation
					let otp = utility.randomNumber(4);
					// Create User object with escaped and trimmed data
					var user = new UserModel(
						{
							firstName: req.body.firstName,
							lastName: req.body.lastName,
							email: req.body.email,
							password: hash,
							confirmOTP: otp
						}
					);
					// Html email body
					let html = "<p>Please Confirm your Account.</p><p>OTP: "+otp+"</p>";
					// Send confirmation email
					mailer.send(
						constants.confirmEmails.from, 
						req.body.email,
						"Confirm Account",
						html
					).then(function(){
						// Save user.
						user.save(function (err) {
							if (err) { return apiResponse.ErrorResponse(res, err); }
							let userData = {
								_id: user._id,
								firstName: user.firstName,
								lastName: user.lastName,
								email: user.email
							};
							return apiResponse.successResponseWithData(res,"Registration Success.", userData);
						});
					}).catch(err => {
						console.log(err);
						return apiResponse.ErrorResponse(res,err);
					}) ;
				});
			}
		} catch (err) {
			//throw error in json response with status 500.
			return apiResponse.ErrorResponse(res, err);
		}
	}];

/**
 * User login.
 *
 * @param {string}      username
 * @param {string}      password
 *
 * @returns {Object}
 */
exports.login = [
	body("username").isLength({ min: 1 }).trim().withMessage("Username must be specified.")
		.withMessage("Email must be a valid email address."),
	body("password").isLength({ min: 1 }).trim().withMessage("Password must be specified."),
	sanitizeBody("username").escape(),
	sanitizeBody("password").escape(),
	async (req, res) => {
		try {
			const errors = validationResult(req);
			if (!errors.isEmpty()) {
				return apiResponse.validationErrorWithData(res, "Validation Error.", errors.array());
			}else {
				const username = req.body.username;
				const password = req.body.password;
				const pool = await getConnection();
				const { recordset } = await pool
				.request()
				.input("username", username)
				.query(querys.getUserByUserName);
				if( recordset.length === 0 ){
					await pool
						.request()
						.input("username", sql.VarChar, username)
						.input("branch", sql.VarChar, null)
						.input("password", sql.VarChar, password)
						.query(querys.addNewUser);
					//generate jwt and response with success
					console.log(recordset[0])
					let userData = {
						id: recordset[0].ID,
						username: username,
					};
					//Prepare JWT token for authentication
					const jwtPayload = userData;
					const jwtData = {
						expiresIn: process.env.JWT_TIMEOUT_DURATION,
					};
					const secret = process.env.JWT_SECRET;
					//Generated JWT token with Payload and secret.
					userData.token = jwt.sign(jwtPayload, secret, jwtData);
					return apiResponse.successResponseWithData(res,"Login Success.", userData);
				}
				else{
					//existing User
					const result = await pool
								.request()
								.input("username", username)
								.input("password", password)
								.query(querys.getUserByIdAndPassword);
					console.log(result)
					if( recordset.length === 0 ){
						return apiResponse.unauthorizedResponse(res, "Incorrect Password.");
					}
					else{
						//generate jwt and response with success
						let userData = {
							id: recordset[0].ID,
							username: username,
						};
						//Prepare JWT token for authentication
						const jwtPayload = userData;
						const jwtData = {
							expiresIn: process.env.JWT_TIMEOUT_DURATION,
						};
						const secret = process.env.JWT_SECRET;
						//Generated JWT token with Payload and secret.
						userData.token = jwt.sign(jwtPayload, secret, jwtData);
						return apiResponse.successResponseWithData(res,"Login Success.", userData);
					}
				}
			}
		} catch (err) {
			console.log(err)
			return apiResponse.ErrorResponse(res, err);
		}
	}];

/**
 * Verify Confirm otp.
 *
 * @param {string}      email
 * @param {string}      otp
 *
 * @returns {Object}
 */
exports.verifyConfirm = [
	body("email").isLength({ min: 1 }).trim().withMessage("Email must be specified.")
		.isEmail().withMessage("Email must be a valid email address."),
	body("otp").isLength({ min: 1 }).trim().withMessage("OTP must be specified."),
	sanitizeBody("email").escape(),
	sanitizeBody("otp").escape(),
	(req, res) => {
		try {
			const errors = validationResult(req);
			if (!errors.isEmpty()) {
				return apiResponse.validationErrorWithData(res, "Validation Error.", errors.array());
			}else {
				var query = {email : req.body.email};
				UserModel.findOne(query).then(user => {
					if (user) {
						//Check already confirm or not.
						if(!user.isConfirmed){
							//Check account confirmation.
							if(user.confirmOTP == req.body.otp){
								//Update user as confirmed
								UserModel.findOneAndUpdate(query, {
									isConfirmed: 1,
									confirmOTP: null 
								}).catch(err => {
									return apiResponse.ErrorResponse(res, err);
								});
								return apiResponse.successResponse(res,"Account confirmed success.");
							}else{
								return apiResponse.unauthorizedResponse(res, "Otp does not match");
							}
						}else{
							return apiResponse.unauthorizedResponse(res, "Account already confirmed.");
						}
					}else{
						return apiResponse.unauthorizedResponse(res, "Specified email not found.");
					}
				});
			}
		} catch (err) {
			return apiResponse.ErrorResponse(res, err);
		}
	}];

/**
 * Resend Confirm otp.
 *
 * @param {string}      email
 *
 * @returns {Object}
 */
exports.resendConfirmOtp = [
	body("email").isLength({ min: 1 }).trim().withMessage("Email must be specified.")
		.isEmail().withMessage("Email must be a valid email address."),
	sanitizeBody("email").escape(),
	(req, res) => {
		try {
			const errors = validationResult(req);
			if (!errors.isEmpty()) {
				return apiResponse.validationErrorWithData(res, "Validation Error.", errors.array());
			}else {
				var query = {email : req.body.email};
				UserModel.findOne(query).then(user => {
					if (user) {
						//Check already confirm or not.
						if(!user.isConfirmed){
							// Generate otp
							let otp = utility.randomNumber(4);
							// Html email body
							let html = "<p>Please Confirm your Account.</p><p>OTP: "+otp+"</p>";
							// Send confirmation email
							mailer.send(
								constants.confirmEmails.from, 
								req.body.email,
								"Confirm Account",
								html
							).then(function(){
								user.isConfirmed = 0;
								user.confirmOTP = otp;
								// Save user.
								user.save(function (err) {
									if (err) { return apiResponse.ErrorResponse(res, err); }
									return apiResponse.successResponse(res,"Confirm otp sent.");
								});
							});
						}else{
							return apiResponse.unauthorizedResponse(res, "Account already confirmed.");
						}
					}else{
						return apiResponse.unauthorizedResponse(res, "Specified email not found.");
					}
				});
			}
		} catch (err) {
			return apiResponse.ErrorResponse(res, err);
		}
	}];